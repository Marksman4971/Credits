/**
 * stats.js - 统计模块
 *
 * 处理周统计、星星计算等
 */

const StatsModule = {
    /**
     * 初始化
     */
    init() {
        console.log('[Stats] 初始化完成');
    },

    /**
     * 刷新统计显示
     */
    refresh() {
        this.checkWeeklyReset();
        this.updateStatsCards();
        this.updateStarBonus();
    },

    /**
     * 检查周重置
     */
    checkWeeklyReset() {
        const currentWeekStart = Utils.getWeekStartString();
        const savedWeekStart = Store.get('system.weekStart');

        if (savedWeekStart !== currentWeekStart) {
            // 新的一周，重置周统计
            ['user77', 'user11'].forEach(user => {
                Store.set(`points.${user}.weekly`, 0);
                Store.set(`stats.${user}.weeklyTasks`, 0);
                Store.set(`stats.${user}.weeklyBounties`, 0);
                Store.set(`stats.${user}.weekStart`, currentWeekStart);
            });

            Store.set('system.weekStart', currentWeekStart);
            console.log('[Stats] 周统计已重置');
        }
    },

    /**
     * 更新统计卡片
     */
    updateStatsCards() {
        ['user77', 'user11'].forEach(user => {
            const weeklyPoints = Store.getWeeklyPoints(user);
            const weeklyTasks = Store.get(`stats.${user}.weeklyTasks`) || 0;
            const weeklyBounties = Store.get(`stats.${user}.weeklyBounties`) || 0;

            const pointsEl = document.getElementById(`stats-${user}-weekly`);
            const tasksEl = document.getElementById(`stats-${user}-tasks`);
            const bountiesEl = document.getElementById(`stats-${user}-bounties`);

            if (pointsEl) pointsEl.textContent = weeklyPoints;
            if (tasksEl) tasksEl.textContent = weeklyTasks;
            if (bountiesEl) bountiesEl.textContent = weeklyBounties;
        });
    },

    /**
     * 更新星星奖励显示
     */
    updateStarBonus() {
        const container = document.getElementById('star-bonus-info');
        if (!container) return;

        const html = ['user77', 'user11'].map(user => {
            const points = Store.getPoints(user);
            const starLevel = Store.getStarLevel(user);
            const taskBonus = Store.getTaskBonus(user);

            return `
                <div class="star-user-info">
                    <h5>${Utils.getUserName(user)}</h5>
                    <div class="star-level">
                        <span class="star-icon">⭐</span>
                        <span class="level-text">Lv.${starLevel}</span>
                    </div>
                    <div class="star-bonus-text">
                        每日任务额外 +${taskBonus} 积分
                    </div>
                    <div class="text-muted">总积分: ${points}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    },

    /**
     * 获取用户周统计摘要
     * @param {string} user
     * @returns {object}
     */
    getWeeklySummary(user) {
        return {
            points: Store.getWeeklyPoints(user),
            tasks: Store.get(`stats.${user}.weeklyTasks`) || 0,
            bounties: Store.get(`stats.${user}.weeklyBounties`) || 0
        };
    },

    /**
     * 获取所有用户总积分
     * @returns {object}
     */
    getTotalPoints() {
        return {
            user77: Store.getPoints('user77'),
            user11: Store.getPoints('user11'),
            total: Store.getPoints('user77') + Store.getPoints('user11')
        };
    }
};

// 导出到全局
window.StatsModule = StatsModule;
