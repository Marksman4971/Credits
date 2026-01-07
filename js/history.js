/**
 * history.js - 历史记录模块
 *
 * 处理历史记录的显示和筛选
 */

const HistoryModule = {
    // 当前筛选
    currentFilter: 'all',

    /**
     * 初始化
     */
    init() {
        // 筛选按钮
        UI.initFilters('.history-filters', (filter) => {
            this.currentFilter = filter;
            this.refresh();
        });

        console.log('[History] 初始化完成');
    },

    /**
     * 刷新历史列表
     */
    refresh() {
        this.renderList();
    },

    /**
     * 渲染历史列表
     */
    renderList() {
        const container = document.getElementById('history-list');
        if (!container) return;

        let history = Store.getHistory();

        // 应用筛选
        if (this.currentFilter !== 'all') {
            history = history.filter(h => h.type === this.currentFilter);
        }

        if (history.length === 0) {
            UI.renderEmptyState(container, '📜', '暂无历史记录');
            return;
        }

        container.innerHTML = history.slice(0, 100).map(record => this.renderItem(record)).join('');
    },

    /**
     * 渲染单条历史记录
     * @param {object} record
     * @returns {string} HTML
     */
    renderItem(record) {
        const icon = this.getIcon(record.type);
        const pointsClass = record.points > 0 ? 'positive' : (record.points < 0 ? 'negative' : '');
        const pointsText = record.points ? (record.points > 0 ? `+${record.points}` : record.points) : '';

        return `
            <div class="history-item">
                <div class="history-icon ${record.type}">${icon}</div>
                <div class="history-content">
                    <div class="history-title">${record.title}</div>
                    ${record.detail ? `<div class="history-desc">${record.detail}</div>` : ''}
                    <div class="history-time">${Utils.formatDate(record.time, 'MM-DD HH:mm')}</div>
                </div>
                ${pointsText ? `<div class="history-points ${pointsClass}">${pointsText}</div>` : ''}
            </div>
        `;
    },

    /**
     * 获取类型图标
     * @param {string} type
     * @returns {string}
     */
    getIcon(type) {
        const icons = {
            bounty: '🎯',
            task: '✅',
            reward: '🎁',
            penalty: '⚠️',
            trade: '🔄',
            system: '⚙️'
        };
        return icons[type] || '📝';
    }
};

// 导出到全局
window.HistoryModule = HistoryModule;
