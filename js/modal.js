/**
 * modal.js - 弹窗管理
 *
 * 统一管理所有弹窗的显示、隐藏和交互
 */

const Modal = {
    // 当前打开的弹窗
    currentModal: null,

    // 弹窗回调
    callbacks: {},

    /**
     * 初始化弹窗事件
     */
    init() {
        // 点击遮罩关闭
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.hide(overlay.id);
                }
            });
        });

        // 初始化确认弹窗
        this.initConfirmModal();

        // 初始化密码弹窗
        this.initPasswordModal();

        // 初始化悬赏弹窗
        this.initBountyModal();

        // 初始化任务池弹窗
        this.initTaskPoolModal();

        // 初始化选择任务弹窗
        this.initSelectTaskModal();

        // ESC 键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentModal) {
                this.hide(this.currentModal);
            }
        });

        console.log('[Modal] 初始化完成');
    },

    /**
     * 显示弹窗
     * @param {string} type - 弹窗类型
     * @param {object} options - 选项
     */
    show(type, options = {}) {
        const modalId = `modal-${type}`;
        const modal = document.getElementById(modalId);

        if (!modal) {
            console.warn(`[Modal] 弹窗不存在: ${modalId}`);
            return;
        }

        // 保存回调
        this.callbacks[type] = options;

        // 根据类型初始化内容
        this.prepareModal(type, options);

        // 显示弹窗
        modal.classList.add('active');
        this.currentModal = modalId;

        // 自动聚焦第一个输入框
        const firstInput = modal.querySelector('input:not([type="hidden"]), textarea, select');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    },

    /**
     * 隐藏弹窗
     * @param {string} modalId - 弹窗 ID
     */
    hide(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }

        if (this.currentModal === modalId) {
            this.currentModal = null;
        }

        // 清理回调
        const type = modalId.replace('modal-', '');
        delete this.callbacks[type];
    },

    /**
     * 准备弹窗内容
     * @param {string} type
     * @param {object} options
     */
    prepareModal(type, options) {
        switch (type) {
            case 'confirm':
                document.getElementById('confirm-title').textContent = options.title || '确认';
                document.getElementById('confirm-message').textContent = options.message || '';
                break;

            case 'password':
                document.getElementById('input-password').value = '';
                break;

            case 'bounty':
                this.resetBountyForm();
                break;

            case 'task-pool':
                if (typeof DailyTaskModule !== 'undefined') {
                    DailyTaskModule.renderPoolList();
                }
                break;

            case 'select-task':
                if (options.user && options.slotIndex !== undefined) {
                    this.renderAvailableTasks(options.user, options.slotIndex);
                }
                break;
        }
    },

    /**
     * 初始化确认弹窗
     */
    initConfirmModal() {
        document.getElementById('confirm-ok')?.addEventListener('click', () => {
            const cb = this.callbacks.confirm;
            if (cb && cb.onConfirm) cb.onConfirm();
            this.hide('modal-confirm');
        });

        document.getElementById('confirm-cancel')?.addEventListener('click', () => {
            const cb = this.callbacks.confirm;
            if (cb && cb.onCancel) cb.onCancel();
            this.hide('modal-confirm');
        });
    },

    /**
     * 初始化密码弹窗
     */
    initPasswordModal() {
        const input = document.getElementById('input-password');
        const confirmBtn = document.getElementById('password-confirm');
        const cancelBtn = document.getElementById('password-cancel');

        confirmBtn?.addEventListener('click', () => {
            const password = input.value;
            const cb = this.callbacks.password;
            if (cb && cb.onConfirm) cb.onConfirm(password);
            this.hide('modal-password');
        });

        cancelBtn?.addEventListener('click', () => {
            const cb = this.callbacks.password;
            if (cb && cb.onCancel) cb.onCancel();
            this.hide('modal-password');
        });

        // 回车确认
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                confirmBtn?.click();
            }
        });
    },

    /**
     * 初始化悬赏弹窗
     */
    initBountyModal() {
        document.getElementById('bounty-submit')?.addEventListener('click', () => {
            if (typeof BountyModule !== 'undefined') {
                BountyModule.create();
            }
        });

        document.getElementById('bounty-cancel')?.addEventListener('click', () => {
            this.hide('modal-bounty');
        });
    },

    /**
     * 重置悬赏表单
     */
    resetBountyForm() {
        document.getElementById('bounty-title').value = '';
        document.getElementById('bounty-desc').value = '';
        document.getElementById('bounty-points').value = '';
        document.getElementById('bounty-publisher').value = 'system';
        document.getElementById('bounty-deadline').value = '';
        document.getElementById('bounty-assignee').value = '';
    },

    /**
     * 初始化任务池弹窗
     */
    initTaskPoolModal() {
        document.getElementById('btn-add-pool-task')?.addEventListener('click', () => {
            if (typeof DailyTaskModule !== 'undefined') {
                DailyTaskModule.addPoolTask();
            }
        });

        document.getElementById('pool-close')?.addEventListener('click', () => {
            this.hide('modal-task-pool');
        });

        // 回车添加
        document.getElementById('new-pool-task')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('btn-add-pool-task')?.click();
            }
        });
    },

    /**
     * 初始化选择任务弹窗
     */
    initSelectTaskModal() {
        document.getElementById('select-task-cancel')?.addEventListener('click', () => {
            this.hide('modal-select-task');
        });
    },

    /**
     * 渲染可选任务列表
     * @param {string} user
     * @param {number} slotIndex
     */
    renderAvailableTasks(user, slotIndex) {
        const container = document.getElementById('available-tasks');
        if (!container) return;

        const taskPool = Store.get('taskPool') || [];
        const dailyTasks = Store.get(`dailyTasks.${user}.slots`) || [];

        // 过滤已选择的任务
        const selectedIds = dailyTasks.map(t => t?.poolTaskId).filter(Boolean);
        const availableTasks = taskPool.filter(t => !selectedIds.includes(t.id));

        if (availableTasks.length === 0) {
            UI.renderEmptyState(container, '📋', '任务池为空，请先添加任务');
            return;
        }

        container.innerHTML = availableTasks.map(task => `
            <div class="available-task-item" data-task-id="${task.id}">
                <div class="task-name">${task.name}</div>
                <div class="task-info">基础积分: ${task.basePoints || 1}</div>
            </div>
        `).join('');

        // 绑定点击事件
        container.querySelectorAll('.available-task-item').forEach(item => {
            item.addEventListener('click', () => {
                const taskId = item.dataset.taskId;
                if (typeof DailyTaskModule !== 'undefined') {
                    DailyTaskModule.selectTask(user, slotIndex, taskId);
                }
                this.hide('modal-select-task');
            });
        });
    }
};

// 导出到全局
window.Modal = Modal;
