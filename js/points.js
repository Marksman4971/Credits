/**
 * points.js - 积分管理模块
 *
 * 处理积分交易、奖励、惩罚
 */

const PointsModule = {
    /**
     * 初始化
     */
    init() {
        // 交易按钮
        document.getElementById('btn-trade')?.addEventListener('click', () => {
            this.trade();
        });

        // 奖励按钮
        document.getElementById('btn-reward')?.addEventListener('click', () => {
            this.reward();
        });

        // 惩罚按钮
        document.getElementById('btn-penalty')?.addEventListener('click', () => {
            this.penalty();
        });

        console.log('[Points] 初始化完成');
    },

    /**
     * 积分交易
     */
    async trade() {
        const fromUser = document.getElementById('trade-from').value;
        const toUser = document.getElementById('trade-to').value;
        const amount = parseInt(document.getElementById('trade-amount').value) || 0;

        // 验证
        if (fromUser === toUser) {
            UI.showToast('转出方和转入方不能相同', 'warning');
            return;
        }

        if (amount <= 0) {
            UI.showToast('请输入有效的积分数量', 'warning');
            return;
        }

        const fromPoints = Store.getPoints(fromUser);
        if (fromPoints < amount) {
            UI.showToast(`${Utils.getUserName(fromUser)} 积分不足`, 'warning');
            return;
        }

        // 需要密码验证
        const verified = await UI.requirePassword();
        if (!verified) return;

        // 执行转账
        Store.deductPoints(fromUser, amount);
        Store.addPoints(toUser, amount);

        // 记录历史
        Store.addHistory({
            type: 'trade',
            action: 'transfer',
            title: '积分转账',
            detail: `${Utils.getUserName(fromUser)} → ${Utils.getUserName(toUser)}: ${amount} 积分`,
            points: amount
        });

        // 清空输入
        document.getElementById('trade-amount').value = '';

        UI.updateScoreDisplay();
        FirebaseSync.sync();
        UI.showToast(`成功转账 ${amount} 积分`, 'success');
    },

    /**
     * 奖励积分
     */
    async reward() {
        const target = document.getElementById('reward-target').value;
        const amount = parseInt(document.getElementById('reward-amount').value) || 0;
        const reason = document.getElementById('reward-reason').value.trim();

        // 验证
        if (amount <= 0) {
            UI.showToast('请输入有效的积分数量', 'warning');
            return;
        }

        // 需要密码验证
        const verified = await UI.requirePassword();
        if (!verified) return;

        // 确定目标用户
        const targets = target === 'both' ? ['user77', 'user11'] : [target];

        // 执行奖励
        targets.forEach(user => {
            Store.addPoints(user, amount);

            Store.addHistory({
                type: 'reward',
                action: 'add',
                title: `奖励积分`,
                detail: `${Utils.getUserName(user)} +${amount} 积分${reason ? ` (${reason})` : ''}`,
                user,
                points: amount
            });
        });

        // 清空输入
        document.getElementById('reward-amount').value = '';
        document.getElementById('reward-reason').value = '';

        UI.updateScoreDisplay();
        FirebaseSync.sync();

        const targetName = target === 'both' ? '77 和 11' : Utils.getUserName(target);
        UI.showToast(`已奖励 ${targetName} ${amount} 积分`, 'success');
    },

    /**
     * 扣除积分
     */
    async penalty() {
        const target = document.getElementById('penalty-target').value;
        const amount = parseInt(document.getElementById('penalty-amount').value) || 0;
        const reason = document.getElementById('penalty-reason').value.trim();

        // 验证
        if (amount <= 0) {
            UI.showToast('请输入有效的积分数量', 'warning');
            return;
        }

        // 需要密码验证
        const verified = await UI.requirePassword();
        if (!verified) return;

        // 确定目标用户
        const targets = target === 'both' ? ['user77', 'user11'] : [target];

        // 执行扣分
        targets.forEach(user => {
            Store.deductPoints(user, amount);

            Store.addHistory({
                type: 'penalty',
                action: 'deduct',
                title: `扣除积分`,
                detail: `${Utils.getUserName(user)} -${amount} 积分${reason ? ` (${reason})` : ''}`,
                user,
                points: -amount
            });
        });

        // 清空输入
        document.getElementById('penalty-amount').value = '';
        document.getElementById('penalty-reason').value = '';

        UI.updateScoreDisplay();
        FirebaseSync.sync();

        const targetName = target === 'both' ? '77 和 11' : Utils.getUserName(target);
        UI.showToast(`已扣除 ${targetName} ${amount} 积分`, 'warning');
    }
};

// 导出到全局
window.PointsModule = PointsModule;
