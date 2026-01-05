/**
 * penalty.js - 惩罚系统模块
 *
 * 规则：
 * - 每天需完成至少3个每日任务
 * - 少完成1个任务扣3分
 * - 连续多天未完成，扣分翻倍
 * - 单日最多扣100分
 */

const PenaltyModule = {
    // 配置
    MIN_TASKS: 3,           // 最少需要完成的任务数
    POINTS_PER_MISS: 3,     // 每少一个任务扣的分
    MAX_DAILY_PENALTY: 100, // 单日最大扣分

    /**
     * 初始化
     */
    init() {
        // 绑定结算按钮
        document.getElementById('btn-check-penalty')?.addEventListener('click', () => {
            this.checkAndApplyPenalty();
        });

        console.log('[Penalty] 初始化完成');
    },

    /**
     * 刷新显示
     */
    refresh() {
        this.renderCards();
        this.renderHistory();
    },

    /**
     * 渲染惩罚状态卡片
     */
    renderCards() {
        const container = document.getElementById('penalty-cards');
        if (!container) return;

        const users = Object.keys(CONFIG.USERS);
        container.innerHTML = users.map(userId => this.renderCard(userId)).join('');
    },

    /**
     * 渲染单个用户卡片
     */
    renderCard(userId) {
        const user = CONFIG.USERS[userId];
        const todayCompleted = this.getTodayCompletedCount(userId);
        const streak = this.getPenaltyStreak(userId);
        const expectedPenalty = this.calculatePenalty(todayCompleted, streak);
        const isSafe = todayCompleted >= this.MIN_TASKS;

        return `
            <div class="penalty-card ${isSafe ? 'safe' : ''}">
                <div class="penalty-card-header">
                    <span class="penalty-card-user">${user.name}</span>
                    <span class="penalty-card-status ${isSafe ? 'safe' : 'danger'}">
                        ${isSafe ? '安全' : '待惩罚'}
                    </span>
                </div>

                <div class="penalty-today">
                    <div class="penalty-today-label">今日完成任务</div>
                    <div class="penalty-today-value">
                        ${todayCompleted} <span>/ ${this.MIN_TASKS} 个</span>
                    </div>
                </div>

                <div class="penalty-info-grid">
                    <div class="penalty-info-item">
                        <div class="penalty-info-label">连续未达标天数</div>
                        <div class="penalty-info-value streak">${streak} 天</div>
                    </div>
                    <div class="penalty-info-item">
                        <div class="penalty-info-label">预计扣分</div>
                        <div class="penalty-info-value ${isSafe ? 'safe' : 'deduct'}">
                            ${isSafe ? '0' : '-' + expectedPenalty}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 获取今日完成的任务数
     */
    getTodayCompletedCount(userId) {
        const dailyTasks = Store.get(`dailyTasks.${userId}`) || { slots: [], lastDate: null };
        const today = Utils.getTodayString();

        // 检查是否是今天的数据
        if (dailyTasks.lastDate !== today) {
            return 0;
        }

        // 计算已完成的任务数（与 daily-task.js 保持一致）
        const slots = dailyTasks.slots || [];
        return slots.filter(s => s?.completed).length;
    },

    /**
     * 获取连续未达标天数
     */
    getPenaltyStreak(userId) {
        const penaltyData = Store.get(`penalty.${userId}`) || { streak: 0 };
        return penaltyData.streak || 0;
    },

    /**
     * 计算应扣分数
     * @param {number} completed - 完成的任务数
     * @param {number} streak - 连续未达标天数
     */
    calculatePenalty(completed, streak) {
        if (completed >= this.MIN_TASKS) {
            return 0;
        }

        const missed = this.MIN_TASKS - completed;
        const basePenalty = missed * this.POINTS_PER_MISS;

        // 连续天数倍率：2^streak，但第一天不翻倍
        const multiplier = streak > 0 ? Math.pow(2, streak) : 1;
        const totalPenalty = basePenalty * multiplier;

        return Math.min(totalPenalty, this.MAX_DAILY_PENALTY);
    },

    /**
     * 检查并执行惩罚
     */
    async checkAndApplyPenalty() {
        const today = Utils.getTodayString();
        const users = Object.keys(CONFIG.USERS);
        let hasChanges = false;
        let messages = [];

        for (const userId of users) {
            const penaltyData = Store.get(`penalty.${userId}`) || {
                streak: 0,
                lastCheckDate: null
            };

            // 检查是否已经结算过今天
            if (penaltyData.lastCheckDate === today) {
                messages.push(`${Utils.getUserName(userId)} 今日已结算`);
                continue;
            }

            const completed = this.getTodayCompletedCount(userId);
            const isSafe = completed >= this.MIN_TASKS;

            if (isSafe) {
                // 达标，重置连续天数
                Store.set(`penalty.${userId}`, {
                    streak: 0,
                    lastCheckDate: today
                });
                messages.push(`${Utils.getUserName(userId)} 达标，连续天数重置`);
            } else {
                // 未达标，执行惩罚
                const newStreak = penaltyData.streak + 1;
                const penalty = this.calculatePenalty(completed, penaltyData.streak);

                // 扣分
                Store.deductPoints(userId, penalty);

                // 更新惩罚数据
                Store.set(`penalty.${userId}`, {
                    streak: newStreak,
                    lastCheckDate: today
                });

                // 记录历史
                Store.addHistory({
                    type: 'penalty',
                    action: 'deduct',
                    title: `惩罚扣分`,
                    detail: `${Utils.getUserName(userId)} 完成 ${completed}/${this.MIN_TASKS} 任务，连续第 ${newStreak} 天未达标`,
                    user: userId,
                    points: -penalty
                });

                messages.push(`${Utils.getUserName(userId)} 扣除 ${penalty} 分`);
                hasChanges = true;
            }
        }

        // 显示结果
        UI.showToast(messages.join('；'), hasChanges ? 'warning' : 'info');

        // 刷新显示
        this.refresh();
        UI.updateScoreDisplay();

        if (hasChanges) {
            FirebaseSync.sync();
        }
    },

    /**
     * 自动检查惩罚（每天首次打开时）
     */
    autoCheck() {
        const today = Utils.getTodayString();
        const lastAutoCheck = Store.get('system.lastPenaltyCheck');

        // 如果今天已经自动检查过，跳过
        if (lastAutoCheck === today) {
            return;
        }

        // 检查昨天是否有未结算的惩罚
        const yesterday = this.getYesterdayString();
        const users = Object.keys(CONFIG.USERS);

        for (const userId of users) {
            const penaltyData = Store.get(`penalty.${userId}`) || {
                streak: 0,
                lastCheckDate: null
            };

            // 如果昨天没有结算，且有任务数据
            if (penaltyData.lastCheckDate &&
                penaltyData.lastCheckDate !== today &&
                penaltyData.lastCheckDate !== yesterday) {
                // 可能漏掉了结算，提示用户
                console.log(`[Penalty] ${userId} 可能有未结算的惩罚`);
            }
        }

        Store.set('system.lastPenaltyCheck', today);
    },

    /**
     * 获取昨天的日期字符串
     */
    getYesterdayString() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return Utils.formatDate(yesterday, 'YYYY-MM-DD');
    },

    /**
     * 渲染惩罚历史
     */
    renderHistory() {
        const container = document.getElementById('penalty-history-list');
        if (!container) return;

        const history = Store.getHistory('penalty').slice(0, 20);

        if (history.length === 0) {
            container.innerHTML = '<div class="penalty-empty">暂无惩罚记录</div>';
            return;
        }

        container.innerHTML = history.map(record => `
            <div class="penalty-history-item">
                <div class="penalty-history-info">
                    <div class="penalty-history-user">${Utils.getUserName(record.user)}</div>
                    <div class="penalty-history-detail">${record.detail}</div>
                </div>
                <div>
                    <div class="penalty-history-points">${record.points} 分</div>
                    <div class="penalty-history-date">${Utils.formatDate(record.time, 'MM-DD HH:mm')}</div>
                </div>
            </div>
        `).join('');
    }
};

// 导出到全局
window.PenaltyModule = PenaltyModule;
