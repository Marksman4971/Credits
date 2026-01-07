/**
 * daily-task.js - 每日任务模块
 *
 * 处理任务池管理、每日任务选择、完成、连续打卡
 */

const DailyTaskModule = {
    /**
     * 初始化
     */
    init() {
        // 管理任务池按钮
        document.getElementById('btn-manage-pool')?.addEventListener('click', () => {
            Modal.show('task-pool');
        });

        // 添加任务按钮
        document.getElementById('btn-user77-add-task')?.addEventListener('click', () => {
            this.openSelectTask('user77');
        });

        document.getElementById('btn-user11-add-task')?.addEventListener('click', () => {
            this.openSelectTask('user11');
        });

        console.log('[DailyTask] 初始化完成');
    },

    /**
     * 刷新显示
     */
    refresh() {
        this.checkDailyReset();
        this.renderPoolPreview();
        this.renderUserTasks('user77');
        this.renderUserTasks('user11');
    },

    /**
     * 检查每日重置
     */
    checkDailyReset() {
        const today = Utils.getTodayString();

        ['user77', 'user11'].forEach(user => {
            const lastDate = Store.get(`dailyTasks.${user}.lastDate`);

            if (lastDate !== today) {
                // 新的一天，重置任务状态但保留任务
                const slots = Store.get(`dailyTasks.${user}.slots`) || [];
                const resetSlots = slots.map(slot => {
                    if (slot) {
                        return { ...slot, completed: false, completedAt: null };
                    }
                    return slot;
                });

                Store.update(`dailyTasks.${user}`, {
                    slots: resetSlots,
                    completed: 0,
                    lastDate: today,
                    dailyBonusGiven: false  // 重置每日奖励标记
                });
            }
        });
    },

    /**
     * 渲染任务池预览
     */
    renderPoolPreview() {
        const container = document.getElementById('task-pool-preview');
        if (!container) return;

        const taskPool = Store.get('taskPool') || [];

        if (taskPool.length === 0) {
            container.innerHTML = `
                <div class="pool-count-info">
                    <span class="pool-count-badge">任务池: 0 个任务</span>
                </div>
                <div class="text-muted text-center mt-2">点击"管理任务池"添加任务</div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="pool-count-info">
                <span class="pool-count-badge">任务池: ${taskPool.length} 个任务</span>
            </div>
            <div class="pool-tasks-grid">
                ${taskPool.slice(0, 6).map(task => `
                    <div class="pool-task-preview">${task.name}</div>
                `).join('')}
                ${taskPool.length > 6 ? `<div class="pool-task-preview text-muted">+${taskPool.length - 6} 更多</div>` : ''}
            </div>
        `;
    },

    /**
     * 渲染任务池列表 (弹窗内)
     */
    renderPoolList() {
        const container = document.getElementById('pool-task-list');
        if (!container) return;

        const taskPool = Store.get('taskPool') || [];

        if (taskPool.length === 0) {
            container.innerHTML = '<div class="text-muted text-center">任务池为空</div>';
            return;
        }

        container.innerHTML = taskPool.map(task => {
            const tags = [];
            if (task.basePoints && task.basePoints !== 1) {
                tags.push(`<span class="task-tag points">${task.basePoints}分</span>`);
            }
            if (task.exclusive) {
                const userName = Utils.getUserName(task.exclusive);
                tags.push(`<span class="task-tag exclusive">${userName}专属</span>`);
            }
            if (task.weeklyLimit > 0) {
                tags.push(`<span class="task-tag limit">每周${task.weeklyLimit}次</span>`);
            }
            if (task.streakTrigger > 0) {
                const rewardText = task.streakRewardType === 'double' ? '翻倍' : `+${task.streakFixedBonus}`;
                tags.push(`<span class="task-tag streak">连续${task.streakTrigger}天${rewardText}</span>`);
            }

            return `
                <div class="pool-task-item" data-id="${task.id}">
                    <div class="pool-task-info">
                        <span class="pool-task-name">${task.name}</span>
                        ${task.description ? `<div class="pool-task-desc">${task.description}</div>` : ''}
                        ${tags.length > 0 ? `<div class="pool-task-tags">${tags.join('')}</div>` : ''}
                    </div>
                    <div class="pool-task-actions">
                        <button class="btn btn-sm btn-secondary" data-action="edit">编辑</button>
                        <button class="btn btn-sm btn-danger" data-action="delete">删除</button>
                    </div>
                </div>
            `;
        }).join('');

        // 绑定事件
        container.querySelectorAll('.pool-task-item').forEach(item => {
            const taskId = item.dataset.id;

            item.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
                this.removePoolTask(taskId);
            });

            item.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
                this.editPoolTask(taskId);
            });
        });
    },

    /**
     * 编辑任务池任务
     * @param {string} taskId
     */
    editPoolTask(taskId) {
        const taskPool = Store.get('taskPool') || [];
        const task = taskPool.find(t => t.id === taskId);
        if (!task) return;

        // 填充编辑表单
        Modal.show('edit-task', { task });
    },

    /**
     * 添加任务到任务池
     */
    addPoolTask() {
        const nameInput = document.getElementById('new-pool-task-name');
        const descInput = document.getElementById('new-pool-task-desc');
        const pointsInput = document.getElementById('new-pool-task-points');
        const exclusiveSelect = document.getElementById('new-pool-task-exclusive');
        const weeklyLimitInput = document.getElementById('new-pool-task-weekly-limit');
        const streakTriggerInput = document.getElementById('new-pool-task-streak-trigger');

        const name = nameInput?.value.trim();
        const description = descInput?.value.trim() || '';
        const basePoints = parseInt(pointsInput?.value) || CONFIG.DEFAULT_TASK_POINTS;
        const exclusive = exclusiveSelect?.value || '';
        const weeklyLimit = parseInt(weeklyLimitInput?.value) || 0;
        const streakTrigger = parseInt(streakTriggerInput?.value) || 0;

        if (!name) {
            UI.showToast('请输入任务名称', 'warning');
            return;
        }

        const taskPool = Store.get('taskPool') || [];

        // 检查重复
        if (taskPool.some(t => t.name === name)) {
            UI.showToast('任务已存在', 'warning');
            return;
        }

        // 获取连续打卡奖励设置
        let streakRewardType = '';
        let streakFixedBonus = 0;
        if (streakTrigger > 0) {
            const rewardTypeRadio = document.querySelector('input[name="streak-reward-type"]:checked');
            streakRewardType = rewardTypeRadio?.value || 'double';
            if (streakRewardType === 'fixed') {
                streakFixedBonus = parseInt(document.getElementById('streak-fixed-bonus')?.value) || 5;
            }
        }

        taskPool.push({
            id: Utils.generateId(),
            name,
            description,
            basePoints,
            exclusive,
            weeklyLimit,
            streakTrigger,
            streakRewardType,
            streakFixedBonus,
            createdAt: new Date().toISOString()
        });

        Store.set('taskPool', taskPool);

        // 清空表单
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
        if (pointsInput) pointsInput.value = '1';
        if (exclusiveSelect) exclusiveSelect.value = '';
        if (weeklyLimitInput) weeklyLimitInput.value = '0';
        if (streakTriggerInput) streakTriggerInput.value = '0';

        this.renderPoolList();
        this.renderPoolPreview();
        FirebaseSync.sync();
        UI.showToast('任务已添加', 'success');
    },

    /**
     * 从任务池删除任务
     * @param {string} taskId
     */
    removePoolTask(taskId) {
        const taskPool = Store.get('taskPool') || [];
        const filtered = taskPool.filter(t => t.id !== taskId);
        Store.set('taskPool', filtered);

        this.renderPoolList();
        this.renderPoolPreview();
        FirebaseSync.sync();
        UI.showToast('任务已删除', 'success');
    },

    /**
     * 渲染用户每日任务
     * @param {string} user
     */
    renderUserTasks(user) {
        const slotsContainer = document.getElementById(`${user}-daily-slots`);
        const progressText = document.getElementById(`${user}-progress-text`);
        const progressFill = document.getElementById(`${user}-progress-fill`);

        if (!slotsContainer) return;

        const dailyData = Store.get(`dailyTasks.${user}`) || { slots: [], completed: 0 };
        const slots = dailyData.slots || [];
        const completed = slots.filter(s => s?.completed).length;
        const userSlots = Store.getTaskSlots(user);  // 使用用户的任务槽数量
        const maxTasks = CONFIG.MAX_DAILY_TASKS;  // 每天最多算5个任务

        // 更新进度
        if (progressText) progressText.textContent = `${completed}/${Math.min(userSlots, maxTasks)}`;
        if (progressFill) {
            const percent = (completed / userSlots) * 100;
            progressFill.style.width = `${percent}%`;
            if (completed >= userSlots) {
                progressFill.classList.add('completed');
            } else {
                progressFill.classList.remove('completed');
            }
        }

        // 渲染槽位 (只渲染用户拥有的槽位数量)
        let html = '';
        for (let i = 0; i < userSlots; i++) {
            const slot = slots[i];
            if (slot && slot.poolTaskId) {
                html += this.renderTaskSlot(user, i, slot);
            } else {
                html += this.renderEmptySlot(user, i);
            }
        }

        slotsContainer.innerHTML = html;

        // 绑定事件
        this.bindSlotEvents(slotsContainer, user);
    },

    /**
     * 渲染空槽位
     * @param {string} user
     * @param {number} index
     * @returns {string}
     */
    renderEmptySlot(user, index) {
        return `
            <div class="task-slot" data-index="${index}">
                <div class="task-slot-empty" data-action="select">
                    <div class="add-icon">+</div>
                    <div>选择任务</div>
                </div>
            </div>
        `;
    },

    /**
     * 渲染已选任务槽位
     * @param {string} user
     * @param {number} index
     * @param {object} slot
     * @returns {string}
     */
    renderTaskSlot(user, index, slot) {
        const taskPool = Store.get('taskPool') || [];
        const task = taskPool.find(t => t.id === slot.poolTaskId);
        const taskName = task?.name || slot.name || '未知任务';

        // 基础积分 + 星星加成
        const basePoints = task?.basePoints || CONFIG.DEFAULT_TASK_POINTS;
        const starBonus = Store.getTaskBonus(user);
        const totalPoints = basePoints + starBonus;

        const streakData = Store.get(`taskStreaks.${user}.${slot.poolTaskId}`) || { count: 0 };
        const streakDays = streakData.count || 0;

        const isCompleted = slot.completed;
        const slotClass = isCompleted ? 'task-slot has-task completed' : 'task-slot has-task';

        return `
            <div class="${slotClass}" data-index="${index}">
                <div class="task-slot-content">
                    <div class="task-info">
                        <div class="task-name">${taskName}</div>
                        <div class="task-points-info">
                            <span class="base-points">${basePoints}分</span>
                            ${starBonus > 0 ? `<span class="star-bonus">+${starBonus}星星</span>` : ''}
                        </div>
                        ${streakDays > 0 ? `<div class="task-streak">连续 ${streakDays} 天</div>` : ''}
                    </div>
                    <div class="task-actions">
                        ${isCompleted ? `
                            <span class="task-completed-badge">✓ 已完成</span>
                        ` : `
                            <button class="btn btn-complete-task btn-sm" data-action="complete">完成 (+${totalPoints})</button>
                            <button class="btn btn-abandon-task btn-sm" data-action="abandon">✕</button>
                        `}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * 绑定槽位事件
     * @param {HTMLElement} container
     * @param {string} user
     */
    bindSlotEvents(container, user) {
        container.querySelectorAll('.task-slot').forEach(slot => {
            const index = parseInt(slot.dataset.index);

            slot.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;

                    switch (action) {
                        case 'select':
                            this.openSelectTask(user, index);
                            break;
                        case 'complete':
                            this.completeTask(user, index);
                            break;
                        case 'abandon':
                            this.abandonTask(user, index);
                            break;
                    }
                });
            });
        });
    },

    /**
     * 打开选择任务弹窗
     * @param {string} user
     * @param {number} slotIndex
     */
    openSelectTask(user, slotIndex = null) {
        const userSlots = Store.getTaskSlots(user);

        // 找到第一个空槽位
        if (slotIndex === null) {
            const slots = Store.get(`dailyTasks.${user}.slots`) || [];
            slotIndex = slots.findIndex((s, i) => i < userSlots && (!s || !s.poolTaskId));
            if (slotIndex === -1 && slots.length < userSlots) {
                slotIndex = slots.length;
            }
            if (slotIndex === -1 || slotIndex >= userSlots) {
                UI.showToast('任务槽已满', 'warning');
                return;
            }
        }

        Modal.show('select-task', { user, slotIndex });
    },

    /**
     * 选择任务
     * @param {string} user
     * @param {number} slotIndex
     * @param {string} taskId
     */
    selectTask(user, slotIndex, taskId) {
        const taskPool = Store.get('taskPool') || [];
        const task = taskPool.find(t => t.id === taskId);

        if (!task) {
            UI.showToast('任务不存在', 'error');
            return;
        }

        const slots = Store.get(`dailyTasks.${user}.slots`) || [];

        // 确保数组长度足够
        while (slots.length <= slotIndex) {
            slots.push(null);
        }

        slots[slotIndex] = {
            poolTaskId: task.id,
            name: task.name,
            points: task.points || 10,
            completed: false,
            selectedAt: new Date().toISOString()
        };

        Store.set(`dailyTasks.${user}.slots`, slots);

        this.renderUserTasks(user);
        FirebaseSync.sync();
        UI.showToast(`已选择: ${task.name}`, 'success');
    },

    /**
     * 完成任务
     * @param {string} user
     * @param {number} slotIndex
     */
    async completeTask(user, slotIndex) {
        const slots = Store.get(`dailyTasks.${user}.slots`) || [];
        const slot = slots[slotIndex];

        if (!slot || slot.completed) return;

        // 获取任务池中的任务配置
        const taskPool = Store.get('taskPool') || [];
        const task = taskPool.find(t => t.id === slot.poolTaskId);

        // 计算基础积分 + 星星加成
        const basePoints = task?.basePoints || CONFIG.DEFAULT_TASK_POINTS;
        const starBonus = Store.getTaskBonus(user);
        let earnedPoints = basePoints + starBonus;

        // 连续打卡处理
        const streakData = Store.get(`taskStreaks.${user}.${slot.poolTaskId}`) || { count: 0, lastDate: null };
        const today = Utils.getTodayString();

        // 更新连续天数
        let newStreak = 1;
        if (streakData.lastDate) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = Utils.formatDate(yesterday, 'YYYY-MM-DD');

            if (streakData.lastDate === yesterdayStr) {
                newStreak = streakData.count + 1;
            } else if (streakData.lastDate === today) {
                newStreak = streakData.count;  // 今天已完成过
            }
        }

        // 检查是否触发连续奖励
        let streakBonusTriggered = false;
        let streakBonusPoints = 0;
        if (task?.streakTrigger && newStreak >= task.streakTrigger) {
            streakBonusTriggered = true;
            if (task.streakRewardType === 'double') {
                // 双倍：基础积分+星星加成 全部翻倍
                streakBonusPoints = earnedPoints;  // 额外加一倍
                earnedPoints *= 2;
            } else if (task.streakRewardType === 'fixed' && task.streakFixedBonus) {
                // 固定奖励
                streakBonusPoints = task.streakFixedBonus;
                earnedPoints += streakBonusPoints;
            }
            // 触发后重置连续天数
            newStreak = 0;
        }

        // 更新任务状态
        slots[slotIndex] = {
            ...slot,
            completed: true,
            completedAt: new Date().toISOString()
        };
        Store.set(`dailyTasks.${user}.slots`, slots);

        // 更新连续天数
        Store.set(`taskStreaks.${user}.${slot.poolTaskId}`, {
            count: newStreak,
            lastDate: today
        });

        // 发放积分
        Store.addPoints(user, earnedPoints);

        // 更新统计
        const weeklyTasks = Store.get(`stats.${user}.weeklyTasks`) || 0;
        Store.set(`stats.${user}.weeklyTasks`, weeklyTasks + 1);

        // 记录历史
        let detail = `${Utils.getUserName(user)} 获得 ${earnedPoints} 积分`;
        if (starBonus > 0) detail += ` (含星星加成 +${starBonus})`;
        if (streakBonusTriggered) detail += ` (连续${task.streakTrigger}天奖励!)`;

        Store.addHistory({
            type: 'task',
            action: 'complete',
            title: `完成任务: ${slot.name}`,
            detail,
            user,
            points: earnedPoints
        });

        // 检查每日完成奖励
        await this.checkDailyBonus(user);

        this.renderUserTasks(user);
        App.refreshHome();
        UI.updateScoreDisplay();
        FirebaseSync.sync();

        // 显示提示
        let toastMsg = `+${earnedPoints} 积分`;
        if (streakBonusTriggered) {
            toastMsg += ` (连续${task.streakTrigger}天奖励!)`;
        }
        UI.showToast(toastMsg, 'success');
    },

    /**
     * 检查并发放每日完成奖励
     * @param {string} user
     */
    async checkDailyBonus(user) {
        const dailyData = Store.get(`dailyTasks.${user}`) || {};
        const slots = dailyData.slots || [];
        const completedCount = slots.filter(s => s?.completed).length;

        // 获取已发放的奖励记录
        let bonusGiven = dailyData.bonusGiven || { three: false, five: false };

        // 完成3个任务额外+1分
        if (completedCount >= 3 && !bonusGiven.three) {
            const bonus = CONFIG.DAILY_BONUS.THREE_TASKS;
            Store.addPoints(user, bonus);
            bonusGiven.three = true;

            Store.addHistory({
                type: 'reward',
                title: '每日完成奖励',
                detail: `${Utils.getUserName(user)} 完成3个任务，额外获得 ${bonus} 积分`,
                user,
                points: bonus
            });

            UI.showToast(`完成3个任务！额外 +${bonus} 积分`, 'success');
        }

        // 完成5个任务再额外+2分
        if (completedCount >= 5 && !bonusGiven.five) {
            const bonus = CONFIG.DAILY_BONUS.FIVE_TASKS;
            Store.addPoints(user, bonus);
            bonusGiven.five = true;

            Store.addHistory({
                type: 'reward',
                title: '每日完成奖励',
                detail: `${Utils.getUserName(user)} 完成5个任务，额外获得 ${bonus} 积分`,
                user,
                points: bonus
            });

            UI.showToast(`完成5个任务！额外 +${bonus} 积分`, 'success');
        }

        // 保存奖励状态
        Store.update(`dailyTasks.${user}`, { bonusGiven });
    },

    /**
     * 放弃任务
     * @param {string} user
     * @param {number} slotIndex
     */
    async abandonTask(user, slotIndex) {
        const confirmed = await UI.confirm('放弃任务', '确定要放弃这个任务吗？');
        if (!confirmed) return;

        const slots = Store.get(`dailyTasks.${user}.slots`) || [];
        slots[slotIndex] = null;
        Store.set(`dailyTasks.${user}.slots`, slots);

        this.renderUserTasks(user);
        FirebaseSync.sync();
        UI.showToast('任务已放弃', 'info');
    },

    /**
     * 渲染首页今日任务
     */
    renderTodayTasks() {
        ['user77', 'user11'].forEach(user => {
            const container = document.querySelector(`#${user}-today-tasks .task-list`);
            if (!container) return;

            const slots = Store.get(`dailyTasks.${user}.slots`) || [];
            const activeTasks = slots.filter(s => s?.poolTaskId);

            if (activeTasks.length === 0) {
                container.innerHTML = '<div class="text-muted">暂无任务</div>';
                return;
            }

            container.innerHTML = activeTasks.map(slot => `
                <div class="today-task-item ${slot.completed ? 'completed' : ''}">
                    <span class="task-name">${slot.name}</span>
                    <span>${slot.completed ? '✓' : '○'}</span>
                </div>
            `).join('');
        });
    }
};

// 导出到全局
window.DailyTaskModule = DailyTaskModule;
