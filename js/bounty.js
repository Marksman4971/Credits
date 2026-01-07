/**
 * bounty.js - 悬赏任务模块
 *
 * 处理悬赏的创建、接取、完成、结算
 * 支持长期悬赏（系统发布）和普通悬赏
 */

const BountyModule = {
    // 当前筛选
    currentFilter: 'all',

    /**
     * 初始化
     */
    init() {
        // 发布普通悬赏按钮
        document.getElementById('btn-create-bounty')?.addEventListener('click', () => {
            Modal.show('bounty');
            setTimeout(() => {
                // 隐藏周期选择（普通悬赏不需要）
                const periodRow = document.getElementById('bounty-period')?.closest('.form-group');
                if (periodRow) periodRow.style.display = 'none';
                // 显示指派人选择
                const assigneeRow = document.getElementById('bounty-assignee')?.closest('.form-group');
                if (assigneeRow) assigneeRow.style.display = 'block';
            }, 100);
        });

        // 发布长期悬赏按钮
        document.getElementById('btn-create-system-bounty')?.addEventListener('click', () => {
            this.showSystemBountyModal();
        });

        // 发布周期任务按钮
        document.getElementById('btn-create-periodic-task')?.addEventListener('click', () => {
            this.showPeriodicTaskModal();
        });

        // 筛选按钮
        UI.initFilters('.bounty-filters', (filter) => {
            this.currentFilter = filter;
            this.refresh();
        });

        console.log('[Bounty] 初始化完成');
    },

    /**
     * 刷新悬赏列表
     */
    refresh() {
        this.checkWeeklyReset();
        this.renderPeriodicTasks();
        this.renderSystemBountyList();
        this.renderList();
        this.updateWeeklyCountDisplay();
        this.checkExpiry();
    },

    /**
     * 检查并重置周计数（周一 6:00）
     */
    checkWeeklyReset() {
        const now = new Date();
        const currentWeekStart = this.getWeekStartTime(now);

        ['user77', 'user11'].forEach(userId => {
            const data = Store.get(`systemBountyWeekly.${userId}`) || { count: 0, weekStart: null };

            if (!data.weekStart || new Date(data.weekStart) < currentWeekStart) {
                Store.set(`systemBountyWeekly.${userId}`, {
                    count: 0,
                    weekStart: currentWeekStart.toISOString()
                });
            }
        });
    },

    /**
     * 获取本周起始时间（周一 6:00）
     */
    getWeekStartTime(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day; // 调整到周一
        d.setDate(d.getDate() + diff);
        d.setHours(CONFIG.SYSTEM_BOUNTY.WEEK_START_HOUR, 0, 0, 0);

        // 如果当前时间在周一6点之前，算上周
        const now = new Date(date);
        if (now < d) {
            d.setDate(d.getDate() - 7);
        }

        return d;
    },

    /**
     * 获取用户本周完成次数
     */
    getWeeklyCount(userId) {
        const data = Store.get(`systemBountyWeekly.${userId}`) || { count: 0 };
        return data.count || 0;
    },

    /**
     * 检查用户是否可以完成系统悬赏
     */
    canCompleteSystemBounty(userId) {
        return this.getWeeklyCount(userId) < CONFIG.SYSTEM_BOUNTY.WEEKLY_LIMIT;
    },

    /**
     * 更新周完成次数显示
     */
    updateWeeklyCountDisplay() {
        const limit = CONFIG.SYSTEM_BOUNTY.WEEKLY_LIMIT;

        ['user77', 'user11'].forEach(userId => {
            const count = this.getWeeklyCount(userId);
            const el = document.getElementById(`${userId}-system-bounty-count`);
            if (el) {
                const userName = Utils.getUserName(userId);
                el.textContent = `${userName}: ${count}/${limit}`;
                el.classList.toggle('limit-reached', count >= limit);
            }
        });
    },

    /**
     * 渲染系统悬赏列表（长期悬赏，不含周期任务）
     */
    renderSystemBountyList() {
        const container = document.getElementById('system-bounty-list');
        if (!container) return;

        // 只显示系统发布的、没有周期的长期悬赏
        const bounties = Store.getBounties().filter(b => b.publisher === 'system' && !b.period);

        if (bounties.length === 0) {
            container.innerHTML = '<div class="empty-state"><span class="empty-icon">📌</span><p>暂无长期悬赏</p></div>';
            return;
        }

        container.innerHTML = bounties.map(bounty => this.renderSystemBountyItem(bounty)).join('');
        this.bindSystemBountyEvents(container);
    },

    /**
     * 渲染单个系统悬赏
     */
    renderSystemBountyItem(bounty) {
        // 获取正在进行中的用户
        const activeUsers = bounty.activeUsers || [];

        return `
            <div class="bounty-item" data-id="${bounty.id}">
                <button class="bounty-delete-btn" data-action="delete" title="删除">×</button>

                <span class="system-badge">长期</span>

                <div class="bounty-item-title">${bounty.title}</div>

                <div class="bounty-info">
                    <div class="bounty-info-item">
                        <span class="label">悬赏积分</span>
                        <span class="value bounty-points">${bounty.points}</span>
                    </div>
                    <div class="bounty-info-item">
                        <span class="label">类型</span>
                        <span class="value">可重复完成</span>
                    </div>
                </div>

                ${bounty.description ? `<div class="bounty-desc">${bounty.description}</div>` : ''}

                <div class="bounty-actions system-bounty-actions">
                    ${this.getSystemBountyActions(bounty)}
                </div>
            </div>
        `;
    },

    /**
     * 获取系统悬赏操作按钮
     */
    getSystemBountyActions(bounty) {
        const activeUsers = bounty.activeUsers || [];
        let html = '';

        ['user77', 'user11'].forEach(userId => {
            const userName = Utils.getUserName(userId);
            const isActive = activeUsers.includes(userId);
            const canComplete = this.canCompleteSystemBounty(userId);
            const weeklyCount = this.getWeeklyCount(userId);
            const limit = CONFIG.SYSTEM_BOUNTY.WEEKLY_LIMIT;

            if (isActive) {
                // 用户正在进行中
                html += `
                    <div class="user-action-row" data-user="${userId}">
                        <span class="user-label">${userName}</span>
                        <button class="btn btn-success btn-sm" data-action="complete-system" data-user="${userId}">完成 (+${bounty.points})</button>
                        <button class="btn btn-secondary btn-sm" data-action="abandon-system" data-user="${userId}">放弃</button>
                    </div>
                `;
            } else if (!canComplete) {
                // 已达上限
                html += `
                    <div class="user-action-row" data-user="${userId}">
                        <span class="user-label">${userName}</span>
                        <span class="limit-warning">本周已达上限</span>
                    </div>
                `;
            } else {
                // 可以接取
                html += `
                    <div class="user-action-row" data-user="${userId}">
                        <span class="user-label">${userName}</span>
                        <button class="btn btn-warning btn-sm" data-action="assign-system" data-user="${userId}">接取</button>
                    </div>
                `;
            }
        });

        return html;
    },

    /**
     * 绑定系统悬赏事件
     */
    bindSystemBountyEvents(container) {
        container.querySelectorAll('.bounty-item').forEach(item => {
            const bountyId = item.dataset.id;

            item.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    const userId = btn.dataset.user;
                    this.handleSystemBountyAction(action, bountyId, userId);
                });
            });
        });
    },

    /**
     * 处理系统悬赏操作
     */
    async handleSystemBountyAction(action, bountyId, userId) {
        switch (action) {
            case 'assign-system':
                await this.assignSystemBounty(bountyId, userId);
                break;
            case 'complete-system':
                await this.completeSystemBounty(bountyId, userId);
                break;
            case 'abandon-system':
                await this.abandonSystemBounty(bountyId, userId);
                break;
            case 'delete':
                await this.delete(bountyId);
                break;
        }
    },

    /**
     * 接取系统悬赏
     */
    async assignSystemBounty(bountyId, userId) {
        const bounty = Store.getBounties().find(b => b.id === bountyId);
        if (!bounty) return;

        const activeUsers = bounty.activeUsers || [];
        if (activeUsers.includes(userId)) {
            UI.showToast('已经接取过了', 'warning');
            return;
        }

        activeUsers.push(userId);
        Store.updateBounty(bountyId, { activeUsers });

        Store.addHistory({
            type: 'bounty',
            action: 'assign',
            title: `${Utils.getUserName(userId)} 接取长期悬赏`,
            detail: bounty.title
        });

        this.refresh();
        FirebaseSync.sync();
        UI.showToast(`${Utils.getUserName(userId)} 已接取任务`, 'success');
    },

    /**
     * 完成系统悬赏
     */
    async completeSystemBounty(bountyId, userId) {
        const bounty = Store.getBounties().find(b => b.id === bountyId);
        if (!bounty) return;

        // 检查周限制
        if (!this.canCompleteSystemBounty(userId)) {
            UI.showToast('本周完成次数已达上限', 'warning');
            return;
        }

        const confirmed = await UI.confirm(
            '完成任务',
            `确认 ${Utils.getUserName(userId)} 完成了「${bounty.title}」？\n将获得 ${bounty.points} 积分。`
        );
        if (!confirmed) return;

        // 发放积分
        Store.addPoints(userId, bounty.points);

        // 从活跃用户中移除
        const activeUsers = (bounty.activeUsers || []).filter(u => u !== userId);
        Store.updateBounty(bountyId, { activeUsers });

        // 增加周完成次数
        const weeklyData = Store.get(`systemBountyWeekly.${userId}`) || { count: 0, weekStart: null };
        Store.set(`systemBountyWeekly.${userId}`, {
            ...weeklyData,
            count: (weeklyData.count || 0) + 1
        });

        // 更新统计
        const weeklyBounties = Store.get(`stats.${userId}.weeklyBounties`) || 0;
        Store.set(`stats.${userId}.weeklyBounties`, weeklyBounties + 1);

        // 记录历史
        Store.addHistory({
            type: 'bounty',
            action: 'complete',
            title: `完成长期悬赏: ${bounty.title}`,
            detail: `${Utils.getUserName(userId)} 获得 ${bounty.points} 积分`,
            user: userId,
            points: bounty.points
        });

        this.refresh();
        App.refreshHome();
        UI.updateScoreDisplay();
        FirebaseSync.sync();
        UI.showToast(`${Utils.getUserName(userId)} 完成任务，获得 ${bounty.points} 积分！`, 'success');
    },

    /**
     * 放弃系统悬赏
     */
    async abandonSystemBounty(bountyId, userId) {
        const bounty = Store.getBounties().find(b => b.id === bountyId);
        if (!bounty) return;

        const confirmed = await UI.confirm('放弃任务', '确定要放弃这个任务吗？');
        if (!confirmed) return;

        const activeUsers = (bounty.activeUsers || []).filter(u => u !== userId);
        Store.updateBounty(bountyId, { activeUsers });

        this.refresh();
        FirebaseSync.sync();
        UI.showToast('已放弃任务', 'info');
    },

    /**
     * 显示创建系统悬赏弹窗
     */
    showSystemBountyModal() {
        // 预设发布者为系统
        Modal.show('bounty');
        setTimeout(() => {
            const publisherSelect = document.getElementById('bounty-publisher');
            if (publisherSelect) {
                publisherSelect.value = 'system';
            }
            // 隐藏周期选择
            const periodRow = document.getElementById('bounty-period')?.closest('.form-group');
            if (periodRow) periodRow.style.display = 'none';
            // 显示指派人选择
            const assigneeRow = document.getElementById('bounty-assignee')?.closest('.form-group');
            if (assigneeRow) assigneeRow.style.display = 'block';
        }, 100);
    },

    /**
     * 显示创建周期任务弹窗
     */
    showPeriodicTaskModal() {
        Modal.show('bounty');
        setTimeout(() => {
            // 预设发布者为系统
            const publisherSelect = document.getElementById('bounty-publisher');
            if (publisherSelect) {
                publisherSelect.value = 'system';
            }
            // 显示周期选择并预设为周任务
            const periodSelect = document.getElementById('bounty-period');
            const periodRow = periodSelect?.closest('.form-group');
            if (periodRow) periodRow.style.display = 'block';
            if (periodSelect) {
                periodSelect.value = 'week';
            }
            // 隐藏指派人选择（周期任务两人都要完成）
            const assigneeRow = document.getElementById('bounty-assignee')?.closest('.form-group');
            if (assigneeRow) assigneeRow.style.display = 'none';
        }, 100);
    },

    /**
     * 渲染普通悬赏列表（非系统悬赏、非周期任务）
     */
    renderList() {
        const container = document.getElementById('bounty-list');
        if (!container) return;

        // 只显示非系统悬赏、非周期任务
        let bounties = Store.getBounties().filter(b => b.publisher !== 'system' && !b.period);

        // 应用筛选
        if (this.currentFilter !== 'all') {
            bounties = bounties.filter(b => b.status === this.currentFilter);
        }

        if (bounties.length === 0) {
            UI.renderEmptyState(container, '🎯', '暂无悬赏任务');
            return;
        }

        container.innerHTML = bounties.map(bounty => this.renderItem(bounty)).join('');

        // 绑定事件
        this.bindItemEvents(container);
    },

    /**
     * 渲染单个普通悬赏
     * @param {object} bounty
     * @returns {string} HTML
     */
    renderItem(bounty) {
        const statusClass = `status-${bounty.status}`;
        const statusText = this.getStatusText(bounty.status);
        const timeInfo = this.getTimeInfo(bounty);

        return `
            <div class="bounty-item" data-id="${bounty.id}">
                <button class="bounty-delete-btn" data-action="delete" title="删除">×</button>

                <span class="bounty-status ${statusClass}">${statusText}</span>

                <div class="bounty-item-title">${bounty.title}</div>

                <div class="bounty-info">
                    <div class="bounty-info-item">
                        <span class="label">悬赏积分</span>
                        <span class="value bounty-points">${bounty.points}</span>
                    </div>
                    <div class="bounty-info-item">
                        <span class="label">发布者</span>
                        <span class="value">${Utils.getUserName(bounty.publisher)}</span>
                    </div>
                    <div class="bounty-info-item">
                        <span class="label">${timeInfo.label}</span>
                        <span class="value ${timeInfo.className}">${timeInfo.text}</span>
                    </div>
                </div>

                ${bounty.description ? `<div class="bounty-desc">${bounty.description}</div>` : ''}

                <div class="bounty-actions">
                    ${this.getActionButtons(bounty)}
                </div>
            </div>
        `;
    },

    /**
     * 获取状态文字
     * @param {string} status
     * @returns {string}
     */
    getStatusText(status) {
        const texts = {
            open: '待接取',
            taken: '进行中',
            settled: '已完成',
            expired: '已过期'
        };
        return texts[status] || status;
    },

    /**
     * 获取时间信息
     * @param {object} bounty
     * @returns {object}
     */
    getTimeInfo(bounty) {
        if (bounty.status === 'settled') {
            return {
                label: '完成时间',
                text: Utils.formatDate(bounty.settledAt, 'MM-DD HH:mm'),
                className: ''
            };
        }

        if (bounty.deadline) {
            const remaining = Utils.getTimeRemaining(bounty.deadline);
            return {
                label: '截止时间',
                text: remaining.text,
                className: remaining.isUrgent ? 'deadline-warning' : 'deadline-normal'
            };
        }

        return {
            label: '创建时间',
            text: Utils.formatDate(bounty.createdAt, 'MM-DD HH:mm'),
            className: ''
        };
    },

    /**
     * 获取操作按钮
     * @param {object} bounty
     * @returns {string} HTML
     */
    getActionButtons(bounty) {
        const { BOUNTY_STATUS } = CONFIG;

        switch (bounty.status) {
            case BOUNTY_STATUS.OPEN:
                return `
                    <button class="btn btn-warning btn-sm" data-action="assign">接取任务</button>
                `;

            case BOUNTY_STATUS.TAKEN:
                return `
                    <span class="text-secondary">接取人: ${Utils.getUserName(bounty.assignee)}</span>
                    <button class="btn btn-success btn-sm" data-action="complete">完成并结算</button>
                `;

            case BOUNTY_STATUS.SETTLED:
                return `
                    <span class="text-success">已发放 ${bounty.points} 积分给 ${Utils.getUserName(bounty.assignee)}</span>
                `;

            case BOUNTY_STATUS.EXPIRED:
                return `<span class="text-danger">任务已过期</span>`;

            default:
                return '';
        }
    },

    /**
     * 绑定列表项事件
     * @param {HTMLElement} container
     */
    bindItemEvents(container) {
        container.querySelectorAll('.bounty-item').forEach(item => {
            const bountyId = item.dataset.id;

            item.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    this.handleAction(action, bountyId);
                });
            });
        });
    },

    /**
     * 处理操作
     * @param {string} action
     * @param {string} bountyId
     */
    async handleAction(action, bountyId) {
        switch (action) {
            case 'assign':
                await this.assign(bountyId);
                break;
            case 'complete':
                await this.completeAndSettle(bountyId);
                break;
            case 'abandon':
                await this.abandon(bountyId);
                break;
            case 'delete':
                await this.delete(bountyId);
                break;
        }
    },

    /**
     * 放弃悬赏
     * @param {string} bountyId
     */
    async abandon(bountyId) {
        const bounty = Store.getBounties().find(b => b.id === bountyId);
        if (!bounty) return;

        const confirmed = await UI.confirm('放弃任务', '确定要放弃这个任务吗？');
        if (!confirmed) return;

        Store.updateBounty(bountyId, {
            assignee: null,
            status: CONFIG.BOUNTY_STATUS.OPEN,
            takenAt: null
        });

        Store.addHistory({
            type: 'bounty',
            action: 'abandon',
            title: `放弃悬赏: ${bounty.title}`,
            detail: bounty.assignee ? Utils.getUserName(bounty.assignee) : ''
        });

        this.refresh();
        FirebaseSync.sync();
        UI.showToast('已放弃任务', 'info');
    },

    /**
     * 创建悬赏
     */
    create() {
        const title = document.getElementById('bounty-title').value.trim();
        const description = document.getElementById('bounty-desc').value.trim();
        const points = parseInt(document.getElementById('bounty-points').value) || 0;
        const publisher = document.getElementById('bounty-publisher').value;
        const deadline = document.getElementById('bounty-deadline').value;
        const assignee = document.getElementById('bounty-assignee').value;
        const period = document.getElementById('bounty-period')?.value || '';

        // 验证
        if (!title) {
            UI.showToast('请输入任务标题', 'warning');
            return;
        }
        if (points <= 0) {
            UI.showToast('请输入有效的积分', 'warning');
            return;
        }

        const bounty = {
            id: Utils.generateId(),
            title,
            description,
            points,
            publisher,
            deadline: deadline || null,
            assignee: assignee || null,
            period: period || null,
            status: assignee ? CONFIG.BOUNTY_STATUS.TAKEN : CONFIG.BOUNTY_STATUS.OPEN,
            createdAt: new Date().toISOString()
        };

        Store.addBounty(bounty);

        // 记录历史
        const periodLabel = period ? this.getPeriodLabel(period) : '';
        Store.addHistory({
            type: 'bounty',
            action: 'create',
            title: `发布${periodLabel}悬赏: ${title}`,
            detail: `积分: ${points}`,
            points: points
        });

        Modal.hide('modal-bounty');
        this.refresh();
        FirebaseSync.sync();
        UI.showToast('悬赏发布成功', 'success');
    },

    /**
     * 获取周期标签
     */
    getPeriodLabel(period) {
        const labels = {
            'week': '周',
            'month': '月',
            'year': '年'
        };
        return labels[period] || '';
    },

    /**
     * 获取周期惩罚分数
     */
    getPeriodPenalty(period) {
        const penalties = {
            'week': 10,
            'month': 30,
            'year': 70
        };
        return penalties[period] || 0;
    },

    /**
     * 检查周期任务是否两人都已完成
     */
    isPeriodicTaskFullyCompleted(task) {
        const completedBy = task.completedBy || [];
        return completedBy.includes('user77') && completedBy.includes('user11');
    },

    /**
     * 渲染周期任务
     */
    renderPeriodicTasks() {
        const bounties = Store.getBounties();

        // 按周期分类（只过滤两人都完成的任务）
        const weekTasks = bounties.filter(b => b.period === 'week' && !this.isPeriodicTaskFullyCompleted(b));
        const monthTasks = bounties.filter(b => b.period === 'month' && !this.isPeriodicTaskFullyCompleted(b));
        const yearTasks = bounties.filter(b => b.period === 'year' && !this.isPeriodicTaskFullyCompleted(b));

        // 渲染各列表
        this.renderPeriodicList('week-task-list', weekTasks);
        this.renderPeriodicList('month-task-list', monthTasks);
        this.renderPeriodicList('year-task-list', yearTasks);

        // 更新截止日期显示
        this.updatePeriodicDeadlines();
    },

    /**
     * 渲染单个周期任务列表
     */
    renderPeriodicList(containerId, tasks) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (tasks.length === 0) {
            container.innerHTML = '<div class="empty-periodic">暂无任务</div>';
            return;
        }

        container.innerHTML = tasks.map(task => `
            <div class="periodic-task-item" data-id="${task.id}">
                <div class="periodic-task-header">
                    <span class="periodic-task-title">${task.title}</span>
                    <span class="periodic-task-points">+${task.points}分</span>
                    <button class="btn btn-danger btn-xs periodic-delete-btn" data-action="delete">×</button>
                </div>
                <div class="periodic-task-users">
                    ${this.renderPeriodicUserStatus(task, 'user77')}
                    ${this.renderPeriodicUserStatus(task, 'user11')}
                </div>
            </div>
        `).join('');

        // 绑定事件
        this.bindPeriodicTaskEvents(container);
    },

    /**
     * 渲染单个用户的周期任务状态
     */
    renderPeriodicUserStatus(task, userId) {
        const userName = Utils.getUserName(userId);
        const completedBy = task.completedBy || [];
        const isCompleted = completedBy.includes(userId);

        if (isCompleted) {
            return `
                <div class="periodic-user-status completed">
                    <span class="user-name">${userName}</span>
                    <span class="status-text">✓ 已完成</span>
                </div>
            `;
        }

        return `
            <div class="periodic-user-status pending">
                <span class="user-name">${userName}</span>
                <button class="btn btn-success btn-xs" data-action="complete-periodic" data-user="${userId}">完成</button>
            </div>
        `;
    },

    /**
     * 绑定周期任务事件
     */
    bindPeriodicTaskEvents(container) {
        container.querySelectorAll('.periodic-task-item').forEach(item => {
            const bountyId = item.dataset.id;

            // 删除按钮
            item.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.delete(bountyId);
                });
            });

            // 完成按钮（带用户参数）
            item.querySelectorAll('[data-action="complete-periodic"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const userId = btn.dataset.user;
                    this.completePeriodicTask(bountyId, userId);
                });
            });
        });
    },

    /**
     * 完成周期任务（单个用户）
     */
    async completePeriodicTask(bountyId, userId) {
        const bounty = Store.getBounties().find(b => b.id === bountyId);
        if (!bounty) return;

        const userName = Utils.getUserName(userId);
        const confirmed = await UI.confirm(
            '完成任务',
            `确认 ${userName} 完成了「${bounty.title}」？\n将获得 ${bounty.points} 积分。`
        );
        if (!confirmed) return;

        // 发放积分
        Store.addPoints(userId, bounty.points);

        // 更新完成状态
        const completedBy = bounty.completedBy || [];
        if (!completedBy.includes(userId)) {
            completedBy.push(userId);
        }
        Store.updateBounty(bountyId, { completedBy });

        // 记录历史
        Store.addHistory({
            type: 'bounty',
            action: 'complete',
            title: `完成${this.getPeriodLabel(bounty.period)}任务: ${bounty.title}`,
            detail: `${userName} 获得 ${bounty.points} 积分`,
            user: userId,
            points: bounty.points
        });

        this.refresh();
        App.refreshHome();
        UI.updateScoreDisplay();
        FirebaseSync.sync();
        UI.showToast(`${userName} 完成任务，获得 ${bounty.points} 积分！`, 'success');
    },

    /**
     * 更新周期截止日期显示
     */
    updatePeriodicDeadlines() {
        const now = new Date();

        // 周任务：本周日截止
        const weekEnd = new Date(now);
        const dayOfWeek = now.getDay();
        const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
        weekEnd.setDate(now.getDate() + daysUntilSunday);
        weekEnd.setHours(23, 59, 59, 999);
        const weekDeadline = document.getElementById('week-deadline');
        if (weekDeadline) {
            weekDeadline.textContent = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()} 截止`;
        }

        // 月任务：本月末截止
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const monthDeadline = document.getElementById('month-deadline');
        if (monthDeadline) {
            monthDeadline.textContent = `${monthEnd.getMonth() + 1}/${monthEnd.getDate()} 截止`;
        }

        // 年任务：年末截止
        const yearDeadline = document.getElementById('year-deadline');
        if (yearDeadline) {
            yearDeadline.textContent = '年末截止';
        }
    },

    /**
     * 接取悬赏
     * @param {string} bountyId
     */
    async assign(bountyId) {
        const bounty = Store.getBounties().find(b => b.id === bountyId);
        if (!bounty) return;

        // 选择接取人
        const users = Object.values(CONFIG.USERS);
        const selectedUser = await this.selectUser('选择接取人', users);
        if (!selectedUser) return;

        Store.updateBounty(bountyId, {
            assignee: selectedUser,
            status: CONFIG.BOUNTY_STATUS.TAKEN,
            takenAt: new Date().toISOString()
        });

        Store.addHistory({
            type: 'bounty',
            action: 'assign',
            title: `${Utils.getUserName(selectedUser)} 接取悬赏`,
            detail: bounty.title
        });

        this.refresh();
        FirebaseSync.sync();
        UI.showToast(`${Utils.getUserName(selectedUser)} 已接取任务`, 'success');
    },

    /**
     * 完成并结算悬赏（自动结算）
     * @param {string} bountyId
     */
    async completeAndSettle(bountyId) {
        const bounty = Store.getBounties().find(b => b.id === bountyId);
        if (!bounty || !bounty.assignee) return;

        // 确认完成
        const confirmed = await UI.confirm(
            '完成任务',
            `确认 ${Utils.getUserName(bounty.assignee)} 完成了「${bounty.title}」？\n将自动发放 ${bounty.points} 积分。`
        );
        if (!confirmed) return;

        // 发放积分
        Store.addPoints(bounty.assignee, bounty.points);

        // 更新状态为已完成
        Store.updateBounty(bountyId, {
            status: CONFIG.BOUNTY_STATUS.SETTLED,
            completedAt: new Date().toISOString(),
            settledAt: new Date().toISOString()
        });

        // 更新统计
        const weeklyBounties = Store.get(`stats.${bounty.assignee}.weeklyBounties`) || 0;
        Store.set(`stats.${bounty.assignee}.weeklyBounties`, weeklyBounties + 1);

        // 记录历史
        Store.addHistory({
            type: 'bounty',
            action: 'complete',
            title: `完成悬赏: ${bounty.title}`,
            detail: `${Utils.getUserName(bounty.assignee)} 获得 ${bounty.points} 积分`,
            user: bounty.assignee,
            points: bounty.points
        });

        this.refresh();
        App.refreshHome();
        UI.updateScoreDisplay();
        FirebaseSync.sync();
        UI.showToast(`${Utils.getUserName(bounty.assignee)} 完成任务，获得 ${bounty.points} 积分！`, 'success');
    },

    /**
     * 删除悬赏
     * @param {string} bountyId
     */
    async delete(bountyId) {
        const confirmed = await UI.confirm('确认删除', '确定要删除这个悬赏吗？');
        if (!confirmed) return;

        const bounty = Store.getBounties().find(b => b.id === bountyId);
        Store.deleteBounty(bountyId);

        if (bounty) {
            Store.addHistory({
                type: 'bounty',
                action: 'delete',
                title: `删除悬赏: ${bounty.title}`
            });
        }

        this.refresh();
        FirebaseSync.sync();
        UI.showToast('悬赏已删除', 'success');
    },

    /**
     * 检查过期悬赏
     */
    checkExpiry() {
        const bounties = Store.getBounties();
        const now = new Date();
        let hasUpdate = false;

        bounties.forEach(bounty => {
            if (bounty.deadline &&
                bounty.status !== CONFIG.BOUNTY_STATUS.SETTLED &&
                bounty.status !== CONFIG.BOUNTY_STATUS.EXPIRED) {

                if (new Date(bounty.deadline) < now) {
                    Store.updateBounty(bounty.id, {
                        status: CONFIG.BOUNTY_STATUS.EXPIRED
                    });
                    hasUpdate = true;
                }
            }
        });

        if (hasUpdate) {
            this.renderList();
        }
    },

    /**
     * 选择用户
     * @param {string} title
     * @param {Array} users
     * @returns {Promise<string|null>}
     */
    selectUser(title, users) {
        return new Promise((resolve) => {
            // 简单实现：使用 confirm 选择
            const userList = users.map(u => u.name).join(' / ');

            // 这里可以改成更好的选择界面
            const selected = prompt(`${title}\n选项: ${userList}\n请输入名字:`);

            if (!selected) {
                resolve(null);
                return;
            }

            const user = users.find(u =>
                u.name === selected || u.id === selected.toLowerCase()
            );

            resolve(user ? user.id : null);
        });
    },

    /**
     * 获取进行中的悬赏 (首页预览用)
     * @returns {Array}
     */
    getActiveBounties() {
        return Store.getBounties().filter(b =>
            b.status === CONFIG.BOUNTY_STATUS.OPEN ||
            b.status === CONFIG.BOUNTY_STATUS.TAKEN
        ).slice(0, 5);
    },

    /**
     * 渲染首页悬赏预览
     */
    renderPreview() {
        const container = document.getElementById('active-bounties-list');
        if (!container) return;

        const bounties = this.getActiveBounties();

        if (bounties.length === 0) {
            container.innerHTML = '<div class="text-muted text-center">暂无进行中的悬赏</div>';
            return;
        }

        container.innerHTML = bounties.map(bounty => `
            <div class="bounty-preview-item">
                <div class="bounty-preview-info">
                    <span class="bounty-status status-${bounty.status}">${this.getStatusText(bounty.status)}</span>
                    <span class="bounty-preview-title">${bounty.title}</span>
                </div>
                <span class="bounty-preview-points">${bounty.points} 分</span>
            </div>
        `).join('');
    }
};

// 导出到全局
window.BountyModule = BountyModule;
