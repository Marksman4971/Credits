/**
 * ui.js - UI 工具函数
 *
 * 提供 Toast 提示、页面切换等 UI 功能
 */

const UI = {
    // 当前页面
    currentPage: 'home',

    /**
     * 显示 Toast 提示
     * @param {string} message - 提示消息
     * @param {string} type - 类型: success, error, warning, info
     * @param {number} duration - 显示时长 (毫秒)
     */
    showToast(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // 自动移除
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * 切换页面
     * @param {string} pageId - 页面 ID
     */
    showPage(pageId) {
        // 隐藏所有页面
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // 显示目标页面
        const targetPage = document.getElementById(`page-${pageId}`);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // 更新导航状态
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.page === pageId) {
                tab.classList.add('active');
            }
        });

        this.currentPage = pageId;

        // 触发页面刷新
        this.onPageChange(pageId);
    },

    /**
     * 页面切换时的回调
     * @param {string} pageId
     */
    onPageChange(pageId) {
        switch (pageId) {
            case 'home':
                if (typeof App !== 'undefined') App.refreshHome();
                break;
            case 'bounty':
                if (typeof BountyModule !== 'undefined') BountyModule.refresh();
                break;
            case 'daily':
                if (typeof DailyTaskModule !== 'undefined') DailyTaskModule.refresh();
                break;
            case 'star-shop':
                if (typeof StarShopModule !== 'undefined') StarShopModule.refresh();
                break;
            case 'penalty':
                if (typeof PenaltyModule !== 'undefined') PenaltyModule.refresh();
                break;
            case 'points':
                // 积分页面不需要特别刷新
                break;
            case 'stats':
                if (typeof StatsModule !== 'undefined') StatsModule.refresh();
                break;
            case 'history':
                if (typeof HistoryModule !== 'undefined') HistoryModule.refresh();
                break;
            case 'settings':
                // 设置页面不需要特别刷新
                break;
        }
    },

    /**
     * 初始化导航事件
     */
    initNavigation() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const pageId = tab.dataset.page;
                if (pageId) {
                    this.showPage(pageId);
                }
            });
        });
    },

    /**
     * 初始化筛选按钮
     * @param {string} containerSelector - 容器选择器
     * @param {Function} callback - 筛选回调
     */
    initFilters(containerSelector, callback) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // 更新激活状态
                container.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('active');
                });
                btn.classList.add('active');

                // 执行回调
                const filter = btn.dataset.filter;
                if (callback) callback(filter);
            });
        });
    },

    /**
     * 更新积分显示
     */
    updateScoreDisplay() {
        // 更新 77 积分
        const user77Total = document.getElementById('user77-total-score');
        const user77Weekly = document.getElementById('user77-weekly-score');
        const user77StarLevel = document.getElementById('user77-star-level');

        if (user77Total) user77Total.textContent = Store.getPoints('user77');
        if (user77Weekly) user77Weekly.textContent = Store.getWeeklyPoints('user77');
        if (user77StarLevel) user77StarLevel.textContent = `Lv.${Store.getStarLevel('user77')}`;

        // 更新 11 积分
        const user11Total = document.getElementById('user11-total-score');
        const user11Weekly = document.getElementById('user11-weekly-score');
        const user11StarLevel = document.getElementById('user11-star-level');

        if (user11Total) user11Total.textContent = Store.getPoints('user11');
        if (user11Weekly) user11Weekly.textContent = Store.getWeeklyPoints('user11');
        if (user11StarLevel) user11StarLevel.textContent = `Lv.${Store.getStarLevel('user11')}`;
    },

    /**
     * 渲染空状态
     * @param {HTMLElement} container - 容器元素
     * @param {string} icon - 图标
     * @param {string} text - 提示文字
     */
    renderEmptyState(container, icon = '📭', text = '暂无数据') {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${icon}</div>
                <div class="empty-state-text">${text}</div>
            </div>
        `;
    },

    /**
     * 确认对话框
     * @param {string} title - 标题
     * @param {string} message - 消息
     * @returns {Promise<boolean>}
     */
    confirm(title, message) {
        return new Promise((resolve) => {
            Modal.show('confirm', {
                title,
                message,
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });
        });
    },

    // 密码验证存储键
    AUTH_STORAGE_KEY: 'credits_auth_verified',

    /**
     * 检查是否已验证密码
     * @returns {boolean}
     */
    isPasswordVerified() {
        return localStorage.getItem(this.AUTH_STORAGE_KEY) === 'true';
    },

    /**
     * 密码验证（验证一次后永久有效）
     * @returns {Promise<boolean>}
     */
    async requirePassword() {
        // 如果已经验证过，直接返回 true
        if (this.isPasswordVerified()) {
            return true;
        }

        return new Promise((resolve) => {
            Modal.show('password', {
                onConfirm: (password) => {
                    if (password === CONFIG.ADMIN_PASSWORD) {
                        // 保存验证状态到 localStorage
                        localStorage.setItem(this.AUTH_STORAGE_KEY, 'true');
                        this.showToast('验证成功', 'success');
                        resolve(true);
                    } else {
                        this.showToast('密码错误', 'error');
                        resolve(false);
                    }
                },
                onCancel: () => resolve(false)
            });
        });
    },

    /**
     * 清除密码验证状态
     */
    clearPasswordVerification() {
        localStorage.removeItem(this.AUTH_STORAGE_KEY);
        this.showToast('已退出验证', 'info');
    },

    /**
     * 绑定连接状态点击事件
     */
    initConnectionStatus() {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.addEventListener('click', () => {
                if (FirebaseSync.isOnline) {
                    FirebaseSync.sync().then(success => {
                        if (success) {
                            this.showToast('同步成功', 'success');
                        }
                    });
                } else {
                    this.showToast('当前离线，请检查网络', 'warning');
                }
            });
        }
    },

    /**
     * 禁用/启用按钮
     * @param {HTMLElement} btn - 按钮元素
     * @param {boolean} disabled - 是否禁用
     * @param {string} loadingText - 加载中文字
     */
    setButtonLoading(btn, disabled, loadingText = '处理中...') {
        if (!btn) return;

        if (disabled) {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = loadingText;
            btn.disabled = true;
        } else {
            btn.textContent = btn.dataset.originalText || btn.textContent;
            btn.disabled = false;
        }
    }
};

// 导出到全局
window.UI = UI;
