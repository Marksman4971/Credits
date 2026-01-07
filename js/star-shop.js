/**
 * star-shop.js - 星星商店模块
 *
 * 处理星星升级和任务槽购买
 */

const StarShopModule = {
    /**
     * 初始化
     */
    init() {
        this.bindEvents();
        console.log('[StarShop] 初始化完成');
    },

    /**
     * 绑定事件（使用事件委托）
     */
    bindEvents() {
        // 星星升级区域的事件委托
        const upgradeContainer = document.getElementById('star-upgrade-cards');
        if (upgradeContainer) {
            upgradeContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-upgrade');
                if (btn && !btn.disabled) {
                    const userId = btn.dataset.user;
                    if (userId) {
                        this.handleUpgrade(userId);
                    }
                }
            });
        }

        // 任务槽购买区域的事件委托
        const slotContainer = document.getElementById('task-slot-cards');
        if (slotContainer) {
            slotContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-buy-slot');
                if (btn && !btn.disabled) {
                    const userId = btn.dataset.user;
                    if (userId) {
                        this.handleBuySlot(userId);
                    }
                }
            });
        }
    },

    /**
     * 刷新商店显示
     */
    refresh() {
        this.renderStarCards();
        this.renderSlotCards();
    },

    /**
     * 渲染星星升级卡片
     */
    renderStarCards() {
        const container = document.getElementById('star-upgrade-cards');
        if (!container) return;

        const users = Object.keys(CONFIG.USERS);
        container.innerHTML = users.map(userId => this.renderStarCard(userId)).join('');
    },

    /**
     * 渲染单个星星卡片
     */
    renderStarCard(userId) {
        const user = CONFIG.USERS[userId];
        const starLevel = Store.getStarLevel(userId);
        const points = Store.getPoints(userId);
        const isMaxLevel = starLevel >= CONFIG.STAR_MAX_LEVEL;
        const upgradeCost = isMaxLevel ? 0 : CONFIG.getUpgradeCost(starLevel);
        const canUpgrade = !isMaxLevel && points >= upgradeCost;
        const taskBonus = CONFIG.getStarBonus(starLevel);

        return `
            <div class="star-card" data-user="${userId}">
                <div class="star-card-header">
                    <div class="star-card-user">
                        <span class="star-card-name">${user.name}</span>
                    </div>
                    <div class="star-card-points">
                        <span class="points-value">${points}</span>
                        <span class="points-label">积分</span>
                    </div>
                </div>

                <div class="star-display">
                    <div class="star-level-circle ${isMaxLevel ? 'max' : ''}">
                        <span class="level-number">${starLevel}</span>
                    </div>
                    <div class="star-bonus">
                        每任务 <strong>+${taskBonus}</strong> 额外积分
                    </div>
                </div>

                <div class="star-upgrade-action">
                    ${isMaxLevel ? `
                        <button class="btn-upgrade disabled" disabled>
                            🏆 已达最高等级
                        </button>
                    ` : `
                        <button class="btn-upgrade ${canUpgrade ? 'can-upgrade' : 'cannot-upgrade'}"
                                data-user="${userId}"
                                ${canUpgrade ? '' : 'disabled'}>
                            <span class="upgrade-icon">⬆️</span>
                            <span class="upgrade-text">升级</span>
                            <span class="upgrade-cost">${upgradeCost} 积分</span>
                        </button>
                        ${!canUpgrade ? `<div class="upgrade-hint">积分不足，还需 ${upgradeCost - points} 积分</div>` : ''}
                    `}
                </div>
            </div>
        `;
    },

    /**
     * 渲染任务槽卡片
     */
    renderSlotCards() {
        const container = document.getElementById('task-slot-cards');
        if (!container) return;

        const users = Object.keys(CONFIG.USERS);
        container.innerHTML = users.map(userId => this.renderSlotCard(userId)).join('');
    },

    /**
     * 渲染单个任务槽卡片
     */
    renderSlotCard(userId) {
        const user = CONFIG.USERS[userId];
        const slots = Store.getTaskSlots(userId);
        const starLevel = Store.getStarLevel(userId);
        const points = Store.getPoints(userId);
        const { canBuy, reason } = Store.canBuyTaskSlot(userId);
        const isLocked = starLevel < CONFIG.TASK_SLOT_UNLOCK_STARS;

        // 渲染槽位显示
        let slotsDisplay = '';
        for (let i = 0; i < Math.min(slots, 10); i++) {
            slotsDisplay += `<span class="slot-dot filled"></span>`;
        }
        if (slots > 10) {
            slotsDisplay += `<span class="slot-more">+${slots - 10}</span>`;
        }

        return `
            <div class="slot-card" data-user="${userId}">
                <div class="slot-card-header">
                    <div class="slot-card-user">
                        <span class="slot-card-name">${user.name}</span>
                    </div>
                    <div class="slot-card-count">
                        <span class="count-value">${slots}</span>
                        <span class="count-label">个槽位</span>
                    </div>
                </div>

                <div class="slot-display">
                    <div class="slot-dots">${slotsDisplay}</div>
                </div>

                <div class="slot-buy-action">
                    ${isLocked ? `
                        <button class="btn-buy-slot locked" disabled>
                            🔒 需要 ${CONFIG.TASK_SLOT_UNLOCK_STARS} 级星星解锁
                        </button>
                    ` : `
                        <button class="btn-buy-slot ${canBuy ? 'can-buy' : 'cannot-buy'}"
                                data-user="${userId}"
                                ${canBuy ? '' : 'disabled'}>
                            <span class="buy-icon">🛒</span>
                            <span class="buy-text">购买任务槽</span>
                            <span class="buy-cost">${CONFIG.TASK_SLOT_PRICE} 积分</span>
                        </button>
                        ${!canBuy && !isLocked ? `<div class="buy-hint">积分不足</div>` : ''}
                    `}
                </div>
            </div>
        `;
    },

    /**
     * 处理升级
     */
    async handleUpgrade(userId) {
        console.log('[StarShop] 尝试升级:', userId);

        const starLevel = Store.getStarLevel(userId);
        const cost = CONFIG.getUpgradeCost(starLevel);
        const userName = Utils.getUserName(userId);

        const confirmed = await UI.confirm(
            '确认升级',
            `${userName} 确定要花费 ${cost} 积分升级星星吗？\n升级后每日任务额外积分将增加！`
        );

        if (!confirmed) return;

        const success = Store.upgradeStarLevel(userId);

        if (success) {
            UI.showToast(`${userName} 升级成功！当前 ${starLevel + 1} 级`, 'success');
            this.refresh();
            UI.updateScoreDisplay();
            FirebaseSync.sync();
        } else {
            UI.showToast('升级失败，积分不足', 'error');
        }
    },

    /**
     * 处理购买任务槽
     */
    async handleBuySlot(userId) {
        console.log('[StarShop] 尝试购买任务槽:', userId);

        const userName = Utils.getUserName(userId);
        const { canBuy, reason } = Store.canBuyTaskSlot(userId);

        if (!canBuy) {
            UI.showToast(reason, 'warning');
            return;
        }

        const confirmed = await UI.confirm(
            '确认购买',
            `${userName} 确定要花费 ${CONFIG.TASK_SLOT_PRICE} 积分购买任务槽吗？`
        );

        if (!confirmed) return;

        const success = Store.buyTaskSlot(userId);

        if (success) {
            const newSlots = Store.getTaskSlots(userId);
            UI.showToast(`${userName} 购买成功！当前 ${newSlots} 个任务槽`, 'success');
            this.refresh();
            UI.updateScoreDisplay();
            FirebaseSync.sync();
        } else {
            UI.showToast('购买失败', 'error');
        }
    }
};

// 导出到全局
window.StarShopModule = StarShopModule;
