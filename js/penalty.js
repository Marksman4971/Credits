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
        this.renderPeriodicPenaltyStatus();
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
     * 渲染周期任务惩罚状态
     */
    renderPeriodicPenaltyStatus() {
        const container = document.getElementById('periodic-penalty-status');
        if (!container) return;

        const bounties = Store.getBounties();

        // 获取各周期任务
        const weekTasks = bounties.filter(b => b.period === 'week' && b.status !== CONFIG.BOUNTY_STATUS.SETTLED);
        const monthTasks = bounties.filter(b => b.period === 'month' && b.status !== CONFIG.BOUNTY_STATUS.SETTLED);
        const yearTasks = bounties.filter(b => b.period === 'year' && b.status !== CONFIG.BOUNTY_STATUS.SETTLED);

        // 计算截止时间
        const now = new Date();
        const weekDeadline = this.getWeekDeadline();
        const monthDeadline = this.getMonthDeadline();
        const yearDeadline = this.getYearDeadline();

        container.innerHTML = `
            <div class="periodic-status-grid">
                ${this.renderPeriodicStatusCard('week', '周任务', weekTasks, weekDeadline, 10)}
                ${this.renderPeriodicStatusCard('month', '月任务', monthTasks, monthDeadline, 30)}
                ${this.renderPeriodicStatusCard('year', '年任务', yearTasks, yearDeadline, 70)}
            </div>
        `;
    },

    /**
     * 渲染单个周期状态卡片
     */
    renderPeriodicStatusCard(period, label, tasks, deadline, penalty) {
        const now = new Date();
        const daysRemaining = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
        const isUrgent = daysRemaining <= 3;

        // 计算完成状态
        const total = tasks.length;
        const completed = tasks.filter(t => t.status === CONFIG.BOUNTY_STATUS.SETTLED).length;
        const inProgress = tasks.filter(t => t.status === CONFIG.BOUNTY_STATUS.TAKEN).length;
        const pending = tasks.filter(t => t.status === CONFIG.BOUNTY_STATUS.OPEN).length;

        const allDone = total === 0 || pending === 0 && inProgress === 0;
        const statusClass = allDone ? 'safe' : (isUrgent ? 'urgent' : 'warning');

        // 格式化截止日期
        const deadlineStr = `${deadline.getMonth() + 1}/${deadline.getDate()}`;

        return `
            <div class="periodic-status-card ${statusClass}">
                <div class="periodic-status-header">
                    <span class="periodic-status-label">${label}</span>
                    <span class="periodic-status-deadline ${isUrgent ? 'urgent' : ''}">
                        ${deadlineStr} 截止 (${daysRemaining}天)
                    </span>
                </div>
                <div class="periodic-status-body">
                    ${total === 0 ? `
                        <div class="periodic-status-empty">暂无任务</div>
                    ` : `
                        <div class="periodic-status-tasks">
                            ${tasks.map(t => this.renderPeriodicTaskItem(t)).join('')}
                        </div>
                    `}
                </div>
                <div class="periodic-status-footer">
                    <span class="periodic-penalty-amount">未完成扣 ${penalty} 分</span>
                </div>
            </div>
        `;
    },

    /**
     * 渲染周期任务项
     */
    renderPeriodicTaskItem(task) {
        const statusClass = task.status === CONFIG.BOUNTY_STATUS.TAKEN ? 'in-progress' : 'pending';
        const statusText = task.status === CONFIG.BOUNTY_STATUS.TAKEN
            ? `${Utils.getUserName(task.assignee)} 进行中`
            : '待接取';

        return `
            <div class="periodic-task-status-item ${statusClass}">
                <span class="task-name">${task.title}</span>
                <span class="task-status">${statusText}</span>
            </div>
        `;
    },

    /**
     * 获取本周截止时间（周日23:59:59）
     */
    getWeekDeadline() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        const deadline = new Date(now);
        deadline.setDate(now.getDate() + daysUntilSunday);
        deadline.setHours(23, 59, 59, 999);
        return deadline;
    },

    /**
     * 获取本月截止时间（月末23:59:59）
     */
    getMonthDeadline() {
        const now = new Date();
        const deadline = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        deadline.setHours(23, 59, 59, 999);
        return deadline;
    },

    /**
     * 获取本年截止时间（12/31 23:59:59）
     */
    getYearDeadline() {
        const now = new Date();
        const deadline = new Date(now.getFullYear(), 11, 31);
        deadline.setHours(23, 59, 59, 999);
        return deadline;
    }
};

// 导出到全局
window.PenaltyModule = PenaltyModule;
