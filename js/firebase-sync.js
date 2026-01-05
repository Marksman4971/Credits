/**
 * firebase-sync.js - Firebase 云同步
 *
 * 负责与 Firebase 实时数据库的同步
 */

const FirebaseSync = {
    // Firebase 引用
    database: null,
    ref: null,
    set: null,
    get: null,
    onValue: null,

    // 状态
    isOnline: false,
    isSyncing: false,
    lastSyncTime: null,
    unsubscribe: null,
    lastUploadTime: null,  // 记录最后上传时间，用于防止循环

    /**
     * 初始化 Firebase
     */
    async init() {
        // 等待 Firebase SDK 加载
        if (!window.firebaseDb) {
            console.log('[Firebase] 等待 SDK 加载...');
            await this.waitForFirebase();
        }

        // 检查 SDK 是否成功加载
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
        this.onValue = fb.onValue;

        // 监听连接状态
        this.monitorConnection();

        // 开始监听远程数据变化
        this.startListening();

        console.log('[Firebase] 初始化完成');
    },

    /**
     * 等待 Firebase SDK 加载完成
     * @returns {Promise}
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

            // 超时处理
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
        // 监听浏览器在线状态
        window.addEventListener('online', () => this.updateStatus(true));
        window.addEventListener('offline', () => this.updateStatus(false));

        // 初始状态
        this.updateStatus(navigator.onLine);
    },

    /**
     * 更新连接状态
     * @param {boolean} online
     * @param {boolean} skipSync - 是否跳过同步
     */
    updateStatus(online, skipSync = false) {
        this.isOnline = online;

        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.className = `connection-status ${online ? 'status-online' : 'status-offline'}`;
            statusEl.querySelector('.status-icon').textContent = online ? '●' : '○';
            statusEl.querySelector('.status-text').textContent = online ? '在线' : '离线';
        }

        // 只有在线状态变化时才触发同步，避免循环
        if (online && !this.isSyncing && !skipSync) {
            this.sync();
        }
    },

    /**
     * 开始监听远程数据变化
     */
    startListening() {
        if (!this.database || !this.ref || !this.onValue) {
            console.warn('[Firebase] 未初始化，无法监听');
            return;
        }

        try {
            const dataRef = this.ref(this.database, 'pointSystemV3');

            this.unsubscribe = this.onValue(dataRef, (snapshot) => {
                if (this.isSyncing) return;  // 避免同步时触发

                const remoteData = snapshot.val();
                if (remoteData) {
                    console.log('[Firebase] 收到远程数据更新');
                    this.handleRemoteUpdate(remoteData);
                }
            }, (error) => {
                console.error('[Firebase] 监听错误:', error);
                this.updateStatus(false);
            });

            console.log('[Firebase] 开始监听远程数据');
        } catch (e) {
            console.error('[Firebase] 启动监听失败:', e);
        }
    },

    /**
     * 处理远程数据更新
     * @param {object} remoteData
     */
    handleRemoteUpdate(remoteData) {
        const remoteTime = remoteData.system?.lastSync;

        // 忽略自己刚上传的数据
        if (remoteTime && remoteTime === this.lastUploadTime) {
            return;
        }

        // 比较时间戳，决定是否更新本地数据
        const localTime = Store.get('system.lastSync');

        if (remoteTime && (!localTime || new Date(remoteTime) > new Date(localTime))) {
            console.log('[Firebase] 远程数据更新，同步到本地');
            Store.replaceData(remoteData);
            this.lastSyncTime = new Date();
            this.updateSyncTimeDisplay();
            UI.showToast('数据已同步', 'info');

            // 刷新页面显示
            if (typeof App !== 'undefined' && App.refresh) {
                App.refresh();
            }
        }
    },

    /**
     * 同步数据到 Firebase (带超时)
     * 先下载远程数据合并，再上传，避免覆盖 VPS 脚本写入的数据
     */
    async sync() {
        if (!this.isOnline || !this.database || !this.set || !this.ref || !this.get) {
            console.log('[Firebase] 无法同步：离线或未初始化');
            return false;
        }

        if (this.isSyncing) {
            console.log('[Firebase] 正在同步中...');
            return false;
        }

        this.isSyncing = true;
        this.showSyncingStatus();

        try {
            const dataRef = this.ref(this.database, 'pointSystemV3');

            // 1. 先下载远程数据
            const snapshot = await this.get(dataRef);
            const remoteData = snapshot.val();

            // 2. 如果远程有数据，合并关键字段（保留 VPS 脚本写入的 penalty 和 history）
            if (remoteData) {
                // 合并 penalty 数据（VPS 脚本写入的）
                if (remoteData.penalty) {
                    Store.data.penalty = this.mergeObjects(Store.data.penalty, remoteData.penalty);
                }

                // 合并 history（保留 VPS 脚本写入的 penalty 记录）
                if (remoteData.history && Array.isArray(remoteData.history)) {
                    const localHistory = Store.data.history || [];
                    const remoteHistory = remoteData.history;

                    // 合并历史记录，去重
                    const mergedHistory = this.mergeHistory(localHistory, remoteHistory);
                    Store.data.history = mergedHistory;
                }

                // 合并 points（取较小值，因为扣分后会变小）
                if (remoteData.points) {
                    for (const userId of ['user77', 'user11']) {
                        if (remoteData.points[userId] && Store.data.points[userId]) {
                            // 如果远程积分更少（被扣分了），使用远程值
                            if (remoteData.points[userId].total < Store.data.points[userId].total) {
                                Store.data.points[userId].total = remoteData.points[userId].total;
                            }
                        }
                    }
                }
            }

            // 3. 更新同步时间
            const syncTime = new Date().toISOString();
            this.lastUploadTime = syncTime;
            Store.data.system = Store.data.system || {};
            Store.data.system.lastSync = syncTime;

            // 4. 上传合并后的数据
            const syncPromise = this.set(dataRef, Store.data);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('同步超时')), 10000);
            });

            await Promise.race([syncPromise, timeoutPromise]);

            // 5. 保存到本地
            Store.save();

            this.lastSyncTime = new Date();
            this.updateSyncTimeDisplay();
            console.log('[Firebase] 同步成功');

            this.isSyncing = false;
            this.updateStatus(true, true);
            return true;
        } catch (e) {
            console.error('[Firebase] 同步失败:', e);
            UI.showToast('同步失败: ' + e.message, 'error');

            this.isSyncing = false;
            this.updateStatus(true, true);
            return false;
        }
    },

    /**
     * 合并两个对象（深度合并）
     */
    mergeObjects(local, remote) {
        const result = { ...local };
        for (const key in remote) {
            if (remote.hasOwnProperty(key)) {
                if (typeof remote[key] === 'object' && remote[key] !== null && !Array.isArray(remote[key])) {
                    result[key] = this.mergeObjects(result[key] || {}, remote[key]);
                } else {
                    // 对于 penalty 数据，优先使用远程值（VPS 脚本写入的）
                    result[key] = remote[key];
                }
            }
        }
        return result;
    },

    /**
     * 合并历史记录（去重）
     */
    mergeHistory(localHistory, remoteHistory) {
        const idSet = new Set();
        const merged = [];

        // 先添加远程历史（包含 VPS 写入的 penalty 记录）
        for (const item of remoteHistory) {
            if (item.id && !idSet.has(item.id)) {
                idSet.add(item.id);
                merged.push(item);
            }
        }

        // 再添加本地历史（不重复的）
        for (const item of localHistory) {
            if (item.id && !idSet.has(item.id)) {
                idSet.add(item.id);
                merged.push(item);
            }
        }

        // 按时间排序（新的在前）
        merged.sort((a, b) => new Date(b.time) - new Date(a.time));

        // 最多保留 500 条
        return merged.slice(0, 500);
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
            timeEl.textContent = Utils.formatDate(this.lastSyncTime, 'HH:mm:ss');
        }
    },

    /**
     * 强制从 Firebase 下载数据
     */
    async forceDownload() {
        if (!this.isOnline || !this.database || !this.get || !this.ref) {
            UI.showToast('无法连接到服务器', 'error');
            return false;
        }

        try {
            this.showSyncingStatus();

            const dataRef = this.ref(this.database, 'pointSystemV3');
            const snapshot = await this.get(dataRef);

            if (snapshot.exists()) {
                Store.replaceData(snapshot.val());
                this.lastSyncTime = new Date();
                this.updateSyncTimeDisplay();
                UI.showToast('数据下载成功', 'success');

                if (typeof App !== 'undefined' && App.refresh) {
                    App.refresh();
                }

                this.updateStatus(true);
                return true;
            } else {
                UI.showToast('服务器无数据', 'warning');
                this.updateStatus(true);
                return false;
            }
        } catch (e) {
            console.error('[Firebase] 下载失败:', e);
            UI.showToast('下载失败', 'error');
            this.updateStatus(false);
            return false;
        }
    },

    /**
     * 停止监听
     */
    stopListening() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
            console.log('[Firebase] 停止监听');
        }
    }
};

// 导出到全局
window.FirebaseSync = FirebaseSync;
