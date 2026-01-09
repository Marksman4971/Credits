/**
 * firebase-sync.js - Firebase 云同步 (简化版)
 *
 * 同步逻辑：
 * - 打开网页：检测云端是否有变动，有变动则云端覆盖本地
 * - 本地修改：延迟2秒自动同步到云端
 * - 关闭/刷新：用 sendBeacon 发送最新数据到云端
 * - 手动点击：立即本地覆盖云端
 * - 冲突时：弹窗让用户选择
 */

const FirebaseSync = {
    // Firebase 引用
    database: null,
    ref: null,
    set: null,
    get: null,

    // 状态
    isOnline: false,
    isSyncing: false,
    lastSyncTime: null,
    syncTimeout: null,

    // 本地修改标志
    localModified: false,

    // 本地记录的上次同步时间戳
    localLastSync: null,

    /**
     * 初始化 Firebase
     */
    async init() {
        // 加载本地记录的同步时间
        this.loadLocalSyncTime();

        // 等待 Firebase SDK 加载
        if (!window.firebaseDb) {
            console.log('[Firebase] 等待 SDK 加载...');
            await this.waitForFirebase();
        }

        if (!window.firebaseDb) {
            console.error('[Firebase] SDK 加载失败');
            this.updateStatus(false);
            return;
        }

        const fb = window.firebaseDb;
        this.database = fb.database;
        this.ref = fb.ref;
        this.set = fb.set;
        this.get = fb.get;

        // 监听连接状态
        this.monitorConnection();

        // 绑定事件
        this.bindEvents();

        console.log('[Firebase] 初始化完成');

        // 页面加载时检测云端变动
        setTimeout(() => {
            this.checkCloudChangesOnLoad();
        }, 500);
    },

    /**
     * 加载本地记录的同步时间
     */
    loadLocalSyncTime() {
        const saved = localStorage.getItem('firebase_last_sync');
        if (saved) {
            this.localLastSync = saved;
        }
    },

    /**
     * 保存同步时间到本地
     */
    saveLocalSyncTime(time) {
        this.localLastSync = time;
        localStorage.setItem('firebase_last_sync', time);
    },

    /**
     * 等待 Firebase SDK 加载完成
     */
    waitForFirebase() {
        return new Promise((resolve) => {
            if (window.firebaseDb) {
                resolve();
                return;
            }

            window.addEventListener('firebaseReady', () => {
                resolve();
            }, { once: true });

            setTimeout(() => {
                console.warn('[Firebase] SDK 加载超时');
                resolve();
            }, 10000);
        });
    },

    /**
     * 监听连接状态
     */
    monitorConnection() {
        window.addEventListener('online', () => this.updateStatus(true));
        window.addEventListener('offline', () => this.updateStatus(false));
        this.updateStatus(navigator.onLine);
    },

    /**
     * 更新连接状态
     */
    updateStatus(online) {
        this.isOnline = online;

        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.className = `connection-status ${online ? 'status-online' : 'status-offline'}`;
            statusEl.querySelector('.status-icon').textContent = online ? '●' : '○';
            statusEl.querySelector('.status-text').textContent = online ? '在线' : '离线';
        }
    },

    /**
     * 绑定事件
     */
    bindEvents() {
        // 云朵同步按钮
        const btnCloudSync = document.getElementById('btn-cloud-sync');
        if (btnCloudSync) {
            btnCloudSync.addEventListener('click', () => this.manualUpload());
        }

        // 页面关闭/刷新时用 sendBeacon 同步
        window.addEventListener('beforeunload', () => {
            this.syncBeforeUnload();
        });

        // 监听 Store 数据变化
        if (typeof Store !== 'undefined') {
            Store.addListener((action) => {
                if (action === 'save') {
                    this.onDataModified();
                }
            });
        }

        // 旧按钮兼容
        const btnUpload = document.getElementById('btn-sync-upload');
        if (btnUpload) {
            btnUpload.addEventListener('click', () => this.manualUpload());
        }

        const btnDownload = document.getElementById('btn-sync-download');
        if (btnDownload) {
            btnDownload.addEventListener('click', () => this.manualDownload());
        }
    },

    /**
     * 页面加载时检测云端变动
     */
    async checkCloudChangesOnLoad() {
        if (!this.isOnline || !this.database) {
            console.log('[Firebase] 离线或未初始化，跳过检测');
            return;
        }

        try {
            const dataRef = this.ref(this.database, 'pointSystemV3');
            const snapshot = await this.get(dataRef);
            const remoteData = snapshot.val();

            if (!remoteData) {
                console.log('[Firebase] 云端无数据');
                return;
            }

            const remoteLastSync = remoteData.system?.lastSync;
            const localLastSync = this.localLastSync;

            console.log('[Firebase] 云端同步时间:', remoteLastSync);
            console.log('[Firebase] 本地记录时间:', localLastSync);

            // 判断云端是否有变动
            const cloudChanged = remoteLastSync && (!localLastSync || remoteLastSync > localLastSync);

            if (cloudChanged) {
                // 云端有变动，检测是否有冲突
                if (this.localModified) {
                    // 本地也有修改，显示冲突弹窗
                    this.showConflictModal(remoteData);
                } else {
                    // 本地没有修改，直接用云端覆盖本地
                    console.log('[Firebase] 云端有变动，覆盖本地');
                    Store.replaceData(remoteData);
                    this.saveLocalSyncTime(remoteLastSync);
                    this.lastSyncTime = new Date();
                    UI.showToast('已从云端同步最新数据', 'success');
                    if (typeof App !== 'undefined' && App.refresh) {
                        App.refresh();
                    }
                }
            } else {
                console.log('[Firebase] 云端无变动');
            }
        } catch (e) {
            console.error('[Firebase] 检测云端变动失败:', e);
        }
    },

    /**
     * 数据修改后的处理
     */
    onDataModified() {
        this.localModified = true;

        // 延迟 2 秒自动同步
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }
        this.syncTimeout = setTimeout(() => {
            this.autoSync();
        }, 2000);
    },

    /**
     * 自动同步（延迟触发）
     */
    async autoSync() {
        if (!this.isOnline || !this.database || this.isSyncing) {
            return;
        }

        try {
            await this.uploadToCloud(false);
            console.log('[Firebase] 自动同步完成');
        } catch (e) {
            console.error('[Firebase] 自动同步失败:', e);
        }
    },

    /**
     * 手动上传（点击云朵按钮）
     */
    async manualUpload() {
        if (!this.isOnline || !this.database) {
            UI.showToast('无法连接到服务器', 'error');
            return;
        }

        if (this.isSyncing) {
            UI.showToast('正在同步中...', 'info');
            return;
        }

        try {
            await this.uploadToCloud(true);
            UI.showToast('已同步到云端', 'success');
        } catch (e) {
            console.error('[Firebase] 上传失败:', e);
            UI.showToast('同步失败: ' + e.message, 'error');
        }
    },

    /**
     * 手动下载
     */
    async manualDownload() {
        if (!this.isOnline || !this.database) {
            UI.showToast('无法连接到服务器', 'error');
            return;
        }

        if (this.isSyncing) {
            UI.showToast('正在同步中...', 'info');
            return;
        }

        try {
            await this.downloadFromCloud(true);
            UI.showToast('已从云端同步', 'success');
        } catch (e) {
            console.error('[Firebase] 下载失败:', e);
            UI.showToast('同步失败: ' + e.message, 'error');
        }
    },

    /**
     * 上传数据到云端
     */
    async uploadToCloud(showStatus = true) {
        this.isSyncing = true;

        if (showStatus) {
            this.showSyncingStatus();
            this.setSyncButtonLoading(true);
        }

        try {
            const syncTime = new Date().toISOString();
            Store.data.system = Store.data.system || {};
            Store.data.system.lastSync = syncTime;

            const dataRef = this.ref(this.database, 'pointSystemV3');
            await this.set(dataRef, Store.data);

            // 保存数据但不触发再次同步
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(Store.data));

            this.saveLocalSyncTime(syncTime);
            this.localModified = false;
            this.lastSyncTime = new Date();
            this.updateSyncTimeDisplay();

            console.log('[Firebase] 上传成功');
        } finally {
            this.isSyncing = false;
            if (showStatus) {
                this.updateStatus(true);
                this.setSyncButtonLoading(false);
            }
        }
    },

    /**
     * 从云端下载数据
     */
    async downloadFromCloud(showStatus = true) {
        this.isSyncing = true;

        if (showStatus) {
            this.showSyncingStatus();
            this.setSyncButtonLoading(true);
        }

        try {
            const dataRef = this.ref(this.database, 'pointSystemV3');
            const snapshot = await this.get(dataRef);

            if (snapshot.exists()) {
                const remoteData = snapshot.val();
                Store.replaceData(remoteData);

                const remoteLastSync = remoteData.system?.lastSync;
                if (remoteLastSync) {
                    this.saveLocalSyncTime(remoteLastSync);
                }

                this.localModified = false;
                this.lastSyncTime = new Date();
                this.updateSyncTimeDisplay();

                if (typeof App !== 'undefined' && App.refresh) {
                    App.refresh();
                }

                console.log('[Firebase] 下载成功');
            } else {
                UI.showToast('云端无数据', 'warning');
            }
        } finally {
            this.isSyncing = false;
            if (showStatus) {
                this.updateStatus(true);
                this.setSyncButtonLoading(false);
            }
        }
    },

    /**
     * 页面关闭前用 sendBeacon 同步
     */
    syncBeforeUnload() {
        if (!this.isOnline || !this.localModified) {
            return;
        }

        try {
            const syncTime = new Date().toISOString();
            Store.data.system = Store.data.system || {};
            Store.data.system.lastSync = syncTime;

            // 使用 sendBeacon 发送数据
            const url = `https://points-reward-system-default-rtdb.firebaseio.com/pointSystemV3.json`;
            const data = JSON.stringify(Store.data);

            navigator.sendBeacon(url, data);

            // 保存同步时间
            localStorage.setItem('firebase_last_sync', syncTime);

            console.log('[Firebase] sendBeacon 已发送');
        } catch (e) {
            console.error('[Firebase] sendBeacon 失败:', e);
        }
    },

    /**
     * 显示冲突弹窗
     */
    showConflictModal(remoteData) {
        const modal = document.getElementById('modal-sync-simple');
        if (!modal) {
            // 直接用云端数据
            Store.replaceData(remoteData);
            return;
        }

        // 更新状态
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.className = 'connection-status status-syncing';
            statusEl.querySelector('.status-icon').textContent = '⚠';
            statusEl.querySelector('.status-text').textContent = '待处理';
        }

        // 计算积分摘要
        const user77Name = typeof Utils !== 'undefined' ? Utils.getUserName('user77') : '77';
        const user11Name = typeof Utils !== 'undefined' ? Utils.getUserName('user11') : '11';

        const localUser77 = Store.data.points?.user77?.total || 0;
        const localUser11 = Store.data.points?.user11?.total || 0;
        const remoteUser77 = remoteData.points?.user77?.total || 0;
        const remoteUser11 = remoteData.points?.user11?.total || 0;

        // 更新弹窗内容
        const localSummary = modal.querySelector('.sync-local-summary');
        const remoteSummary = modal.querySelector('.sync-remote-summary');

        if (localSummary) {
            localSummary.innerHTML = `${user77Name}: ${localUser77}分 | ${user11Name}: ${localUser11}分`;
        }
        if (remoteSummary) {
            remoteSummary.innerHTML = `${user77Name}: ${remoteUser77}分 | ${user11Name}: ${remoteUser11}分`;
        }

        // 绑定按钮事件
        const self = this;

        const oldBtnLocal = modal.querySelector('.sync-btn-local');
        const oldBtnRemote = modal.querySelector('.sync-btn-remote');

        if (oldBtnLocal) {
            const btnLocal = oldBtnLocal.cloneNode(true);
            oldBtnLocal.parentNode.replaceChild(btnLocal, oldBtnLocal);

            btnLocal.onclick = async function() {
                modal.classList.remove('active');
                await self.uploadToCloud(true);
                UI.showToast('已使用本地数据覆盖云端', 'success');
                if (typeof App !== 'undefined' && App.refresh) App.refresh();
            };
        }

        if (oldBtnRemote) {
            const btnRemote = oldBtnRemote.cloneNode(true);
            oldBtnRemote.parentNode.replaceChild(btnRemote, oldBtnRemote);

            btnRemote.onclick = async function() {
                modal.classList.remove('active');
                Store.replaceData(remoteData);
                const remoteLastSync = remoteData.system?.lastSync;
                if (remoteLastSync) {
                    self.saveLocalSyncTime(remoteLastSync);
                }
                self.localModified = false;
                self.updateStatus(true);
                UI.showToast('已使用云端数据覆盖本地', 'success');
                if (typeof App !== 'undefined' && App.refresh) App.refresh();
            };
        }

        // 显示弹窗
        modal.classList.add('active');
    },

    /**
     * 显示同步中状态
     */
    showSyncingStatus() {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.className = 'connection-status status-syncing';
            statusEl.querySelector('.status-icon').textContent = '◐';
            statusEl.querySelector('.status-text').textContent = '同步中';
        }
    },

    /**
     * 更新同步时间显示
     */
    updateSyncTimeDisplay() {
        const timeEl = document.getElementById('last-sync-time');
        if (timeEl && this.lastSyncTime) {
            const time = this.lastSyncTime;
            const hours = String(time.getHours()).padStart(2, '0');
            const minutes = String(time.getMinutes()).padStart(2, '0');
            const seconds = String(time.getSeconds()).padStart(2, '0');
            timeEl.textContent = `${hours}:${minutes}:${seconds}`;
        }
    },

    /**
     * 设置同步按钮加载状态
     */
    setSyncButtonLoading(loading) {
        const btn = document.getElementById('btn-cloud-sync');
        if (btn) {
            if (loading) {
                btn.classList.add('syncing');
            } else {
                btn.classList.remove('syncing');
            }
        }
    },

    /**
     * 兼容旧的方法
     */
    async smartSync() {
        return this.manualUpload();
    },

    async sync() {
        return this.manualUpload();
    },

    onPointsChanged() {
        this.onDataModified();
    }
};

// 导出到全局
window.FirebaseSync = FirebaseSync;
