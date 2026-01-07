/**
 * stats.js - 统计模块
 *
 * 处理周统计、积分来源统计等
 */

const StatsModule = {
    // 积分来源类型映射
    sourceTypes: {
        'task': '每日任务',
        'bounty': '悬赏任务',
        'reward': '奖励',
        'penalty': '惩罚',
        'adjust': '手动调整',
        'other': '其他'
    },

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
        this.updateWeeklyTable();
        this.updateTotalTable();
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
     * 获取本周日期范围
     */
    getWeekRange() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 周一为起点

        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - diff);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
        return `(${formatDate(weekStart)} - ${formatDate(weekEnd)})`;
    },

    /**
     * 从历史记录统计积分来源
     * @param {boolean} weeklyOnly - 是否只统计本周
     */
    calculatePointsBySource(weeklyOnly = false) {
        const history = Store.getHistory();
        const weekStart = Utils.getWeekStartString();

        const stats = {
            user77: { task: 0, bounty: 0, reward: 0, penalty: 0, adjust: 0, other: 0 },
            user11: { task: 0, bounty: 0, reward: 0, penalty: 0, adjust: 0, other: 0 }
        };

        history.forEach(record => {
            if (!record.user || !record.points) return;

            // 如果是周统计，只计算本周的记录
            if (weeklyOnly) {
                const recordDate = record.time ? record.time.split('T')[0] : '';
                if (recordDate < weekStart) return;
            }

            const user = record.user;
            const points = record.points || 0;
            const type = record.type || 'other';

            if (stats[user]) {
                if (stats[user].hasOwnProperty(type)) {
                    stats[user][type] += points;
                } else {
                    stats[user].other += points;
                }
            }
        });

        return stats;
    },

    /**
     * 更新本周积分明细表格
     */
    updateWeeklyTable() {
        const weekRangeEl = document.getElementById('week-range');
        if (weekRangeEl) {
            weekRangeEl.textContent = this.getWeekRange();
        }

        const stats = this.calculatePointsBySource(true);
        const tbody = document.getElementById('weekly-stats-body');
        if (!tbody) return;

        let html = '';
        let total77 = 0;
        let total11 = 0;

        // 按来源类型显示
        for (const [type, label] of Object.entries(this.sourceTypes)) {
            const val77 = stats.user77[type] || 0;
            const val11 = stats.user11[type] || 0;

            // 只显示有数据的行
            if (val77 !== 0 || val11 !== 0) {
                const class77 = val77 > 0 ? 'positive' : (val77 < 0 ? 'negative' : '');
                const class11 = val11 > 0 ? 'positive' : (val11 < 0 ? 'negative' : '');

                html += `
                    <tr>
                        <td>${label}</td>
                        <td class="${class77}">${val77 > 0 ? '+' : ''}${val77}</td>
                        <td class="${class11}">${val11 > 0 ? '+' : ''}${val11}</td>
                    </tr>
                `;
                total77 += val77;
                total11 += val11;
            }
        }

        if (html === '') {
            html = '<tr><td colspan="3" class="empty-row">本周暂无积分变动</td></tr>';
        }

        tbody.innerHTML = html;

        // 更新合计
        const total77El = document.getElementById('weekly-total-user77');
        const total11El = document.getElementById('weekly-total-user11');
        if (total77El) {
            total77El.textContent = (total77 > 0 ? '+' : '') + total77;
            total77El.className = total77 > 0 ? 'positive' : (total77 < 0 ? 'negative' : '');
        }
        if (total11El) {
            total11El.textContent = (total11 > 0 ? '+' : '') + total11;
            total11El.className = total11 > 0 ? 'positive' : (total11 < 0 ? 'negative' : '');
        }
    },

    /**
     * 更新总积分来源表格
     */
    updateTotalTable() {
        const stats = this.calculatePointsBySource(false);
        const tbody = document.getElementById('total-stats-body');
        if (!tbody) return;

        let html = '';
        let total77 = 0;
        let total11 = 0;

        // 按来源类型显示
        for (const [type, label] of Object.entries(this.sourceTypes)) {
            const val77 = stats.user77[type] || 0;
            const val11 = stats.user11[type] || 0;

            // 只显示有数据的行
            if (val77 !== 0 || val11 !== 0) {
                const class77 = val77 > 0 ? 'positive' : (val77 < 0 ? 'negative' : '');
                const class11 = val11 > 0 ? 'positive' : (val11 < 0 ? 'negative' : '');

                html += `
                    <tr>
                        <td>${label}</td>
                        <td class="${class77}">${val77 > 0 ? '+' : ''}${val77}</td>
                        <td class="${class11}">${val11 > 0 ? '+' : ''}${val11}</td>
                    </tr>
                `;
                total77 += val77;
                total11 += val11;
            }
        }

        if (html === '') {
            html = '<tr><td colspan="3" class="empty-row">暂无积分记录</td></tr>';
        }

        tbody.innerHTML = html;

        // 更新合计（显示当前实际总积分）
        const actual77 = Store.getPoints('user77');
        const actual11 = Store.getPoints('user11');

        const total77El = document.getElementById('total-points-user77');
        const total11El = document.getElementById('total-points-user11');
        if (total77El) total77El.textContent = actual77;
        if (total11El) total11El.textContent = actual11;
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
