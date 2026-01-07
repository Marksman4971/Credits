/**
 * app.js - 主程序
 *
 * 应用入口，负责初始化所有模块
 */

const App = {
    /**
     * 启动应用
     */
    async init() {
        console.log(`[App] ${CONFIG.APP_NAME} v${CONFIG.VERSION} 启动中...`);

        try {
            // 1. 初始化数据存储
            Store.init();

            // 2. 初始化 UI
            UI.initNavigation();
            UI.initConnectionStatus();

            // 3. 初始化弹窗
            Modal.init();

            // 4. 初始化各功能模块
            BountyModule.init();
            DailyTaskModule.init();
            PointsModule.init();
            StatsModule.init();
            HistoryModule.init();
            StarShopModule.init();
            PenaltyModule.init();

            // 5. 初始化 Firebase
            await FirebaseSync.init();

            // 6. 初始化设置页面
            this.initSettings();

            // 7. 初始显示
            this.refresh();

            // 8. 显示首页
            UI.showPage('home');

            // 9. 定时检查
            this.startTimers();

            console.log('[App] 启动完成');
        } catch (error) {
            console.error('[App] 启动失败:', error);
            UI.showToast('应用启动失败', 'error');
        }
    },

    /**
     * 刷新所有显示
     */
    refresh() {
        UI.updateScoreDisplay();
        this.refreshHome();
    },

    /**
     * 刷新首页
     */
    refreshHome() {
        UI.updateScoreDisplay();
        BountyModule.renderPreview();
        DailyTaskModule.renderTodayTasks();
    },

    /**
     * 清空所有历史记录
     */
    async clearAllHistory() {
        const confirmed = await UI.confirm('清空历史', '确定要清空所有历史记录吗？');
        if (!confirmed) return;

        const verified = await UI.requirePassword();
        if (!verified) return;

        Store.clearHistory();
        HistoryModule.refresh();
        StatsModule.refresh();

        // 强制上传清空后的数据到云端（不要用 sync，否则会把云端数据下载回来）
        await FirebaseSync.forceUpload(false);
        UI.showToast('历史记录已清空', 'success');
    },

    /**
     * 初始化设置页面
     */
    initSettings() {
        // 手动同步
        document.getElementById('btn-sync')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-sync');
            UI.setButtonLoading(btn, true, '同步中...');

            const success = await FirebaseSync.sync();
            UI.setButtonLoading(btn, false);

            if (success) {
                UI.showToast('同步成功', 'success');
            }
        });

        // 导出数据
        document.getElementById('btn-export')?.addEventListener('click', () => {
            this.exportData();
        });

        // 导入数据
        document.getElementById('btn-import')?.addEventListener('click', () => {
            this.importData();
        });

        // 清空历史（设置页）
        document.getElementById('btn-clear-history')?.addEventListener('click', () => {
            App.clearAllHistory();
        });

        // 重置周统计
        document.getElementById('btn-reset-weekly')?.addEventListener('click', async () => {
            const confirmed = await UI.confirm('重置周统计', '确定要重置本周统计数据吗？');
            if (!confirmed) return;

            const verified = await UI.requirePassword();
            if (!verified) return;

            ['user77', 'user11'].forEach(user => {
                Store.set(`points.${user}.weekly`, 0);
                Store.set(`stats.${user}.weeklyTasks`, 0);
                Store.set(`stats.${user}.weeklyBounties`, 0);
            });

            StatsModule.refresh();
            UI.updateScoreDisplay();
            FirebaseSync.sync();
            UI.showToast('周统计已重置', 'success');
        });

        // 重置所有数据
        document.getElementById('btn-reset-all')?.addEventListener('click', async () => {
            const confirmed = await UI.confirm('重置所有数据', '⚠️ 这将删除所有数据！此操作不可恢复！');
            if (!confirmed) return;

            const verified = await UI.requirePassword();
            if (!verified) return;

            Store.reset();
            this.refresh();
            FirebaseSync.sync();
            UI.showToast('所有数据已重置', 'warning');
        });
    },

    /**
     * 导出数据
     */
    exportData() {
        const data = Store.export();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `积分系统备份_${Utils.formatDate(new Date(), 'YYYY-MM-DD')}.json`;
        a.click();

        URL.revokeObjectURL(url);
        UI.showToast('数据已导出', 'success');
    },

    /**
     * 导入数据
     */
    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const success = Store.import(text);

                if (success) {
                    this.refresh();
                    FirebaseSync.sync();
                    UI.showToast('数据导入成功', 'success');
                } else {
                    UI.showToast('数据格式错误', 'error');
                }
            } catch (error) {
                console.error('导入失败:', error);
                UI.showToast('导入失败', 'error');
            }
        };

        input.click();
    },

    /**
     * 启动定时任务
     */
    startTimers() {
        // 每分钟检查一次
        setInterval(() => {
            // 检查悬赏过期
            BountyModule.checkExpiry();

            // 检查每日重置
            DailyTaskModule.checkDailyReset();
        }, 60000);

        // 自动同步
        setInterval(() => {
            if (FirebaseSync.isOnline && !FirebaseSync.isSyncing) {
                FirebaseSync.sync();
            }
        }, CONFIG.AUTO_SYNC_INTERVAL);
    }
};

// 页面加载完成后启动
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// 导出到全局
window.App = App;
