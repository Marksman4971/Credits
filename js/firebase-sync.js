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

    // 冲突解决回调
    conflictResolveCallback: null,

    // 缓存的远程数据（用于冲突比较）
    cachedRemoteData: null,

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

        // 绑定同步按钮事件
        this.bindSyncButtons();

        console.log('[Firebase] 初始化完成');

        // 页面加载时自动同步一次
        setTimeout(() => {
            this.autoSyncOnLoad();
        }, 500);
    },

    /**
     * 页面加载时自动同步
     */
    async autoSyncOnLoad() {
        if (!this.isOnline || !this.database) {
            console.log('[Firebase] 离线或未初始化，跳过自动同步');
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

            // 检测冲突
            const conflict = this.detectConflict(Store.data, remoteData);

            if (conflict.hasConflict) {
                // 有冲突，显示简化的选择弹窗
                this.cachedRemoteData = remoteData;
                this.showSimpleConflictModal(Store.data, remoteData, conflict);
            } else {
                // 无冲突，静默合并
                await this.mergeAndSync(remoteData);
                console.log('[Firebase] 自动同步完成（无冲突）');
            }
        } catch (e) {
            console.error('[Firebase] 自动同步失败:', e);
        }
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
     * 更新连接状态（不自动同步）
     * @param {boolean} online
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
     * 绑定同步按钮事件
     */
    bindSyncButtons() {
        // 智能同步按钮
        const btnSync = document.getElementById('btn-sync');
        if (btnSync) {
            btnSync.addEventListener('click', () => this.smartSync());
        }

        // 本地→云端按钮
        const btnUpload = document.getElementById('btn-sync-upload');
        if (btnUpload) {
            btnUpload.addEventListener('click', () => this.confirmForceUpload());
        }

        // 云端→本地按钮
        const btnDownload = document.getElementById('btn-sync-download');
        if (btnDownload) {
            btnDownload.addEventListener('click', () => this.confirmForceDownload());
        }

        // 冲突弹窗按钮
        this.bindConflictButtons();
    },

    /**
     * 绑定冲突弹窗按钮
     */
    bindConflictButtons() {
        const btnCancel = document.getElementById('conflict-cancel');
        const btnUseLocal = document.getElementById('conflict-use-local');
        const btnUseRemote = document.getElementById('conflict-use-remote');

        if (btnCancel) {
            btnCancel.addEventListener('click', () => {
                this.hideConflictModal();
                if (this.conflictResolveCallback) {
                    this.conflictResolveCallback('cancel');
                }
            });
        }

        if (btnUseLocal) {
            btnUseLocal.addEventListener('click', () => {
                this.hideConflictModal();
                if (this.conflictResolveCallback) {
                    this.conflictResolveCallback('local');
                }
            });
        }

        if (btnUseRemote) {
            btnUseRemote.addEventListener('click', () => {
                this.hideConflictModal();
                if (this.conflictResolveCallback) {
                    this.conflictResolveCallback('remote');
                }
            });
        }
    },

    /**
     * 智能同步 - 检测冲突并让用户选择
     */
    async smartSync() {
        if (!this.isOnline || !this.database || !this.get || !this.ref) {
            UI.showToast('无法连接到服务器', 'error');
            return false;
        }

        if (this.isSyncing) {
            UI.showToast('正在同步中...', 'info');
            return false;
        }

        this.isSyncing = true;
        this.showSyncingStatus();

        try {
            // 1. 获取远程数据
            const dataRef = this.ref(this.database, 'pointSystemV3');
            const snapshot = await this.get(dataRef);
            const remoteData = snapshot.val();

            // 2. 如果远程没有数据，直接上传本地数据
            if (!remoteData) {
                await this.forceUpload(false);
                UI.showToast('云端无数据，已上传本地数据', 'success');
                this.isSyncing = false;
                this.updateStatus(true);
                return true;
            }

            // 3. 检测冲突
            const conflict = this.detectConflict(Store.data, remoteData);

            if (conflict.hasConflict) {
                // 显示冲突弹窗
                this.cachedRemoteData = remoteData;
                const choice = await this.showConflictModal(Store.data, remoteData, conflict);

                if (choice === 'cancel') {
                    this.isSyncing = false;
                    this.updateStatus(true);
                    return false;
                }

                await this.resolveConflict(choice, remoteData);
            } else {
                // 无冲突，执行智能合并
                await this.mergeAndSync(remoteData);
                UI.showToast('同步成功', 'success');
            }

            this.isSyncing = false;
            this.updateStatus(true);
            return true;
        } catch (e) {
            console.error('[Firebase] 智能同步失败:', e);
            UI.showToast('同步失败: ' + e.message, 'error');
            this.isSyncing = false;
            this.updateStatus(true);
            return false;
        }
    },

    /**
     * 检测数据冲突
     * @param {object} localData
     * @param {object} remoteData
     * @returns {object} 冲突信息
     */
    detectConflict(localData, remoteData) {
        const conflict = {
            hasConflict: false,
            points: { user77: false, user11: false },
            details: []
        };

        // 只检查总积分差异
        for (const userId of ['user77', 'user11']) {
            const localPoints = localData.points?.[userId]?.total || 0;
            const remotePoints = remoteData.points?.[userId]?.total || 0;

            if (localPoints !== remotePoints) {
                conflict.hasConflict = true;
                conflict.points[userId] = true;
                conflict.details.push({
                    field: userId,
                    local: localPoints,
                    remote: remotePoints,
                    diff: localPoints - remotePoints
                });
            }
        }

        return conflict;
    },

    /**
     * 显示冲突弹窗
     * @param {object} localData
     * @param {object} remoteData
     * @param {object} conflict
     * @returns {Promise<string>} 用户选择
     */
    showConflictModal(localData, remoteData, conflict) {
        return new Promise((resolve) => {
            this.conflictResolveCallback = resolve;

            // 填充本地数据
            const localContainer = document.getElementById('conflict-local-data');
            if (localContainer) {
                localContainer.innerHTML = this.formatDataForDisplay(localData, 'local', conflict);
            }

            // 填充远程数据
            const remoteContainer = document.getElementById('conflict-remote-data');
            if (remoteContainer) {
                remoteContainer.innerHTML = this.formatDataForDisplay(remoteData, 'remote', conflict);
            }

            // 显示弹窗
            const modal = document.getElementById('modal-sync-conflict');
            if (modal) {
                modal.classList.add('active');
            }

            // 更新状态为等待用户选择
            const statusEl = document.getElementById('connection-status');
            if (statusEl) {
                statusEl.className = 'connection-status status-syncing';
                statusEl.querySelector('.status-icon').textContent = '⚠';
                statusEl.querySelector('.status-text').textContent = '待处理';
            }
        });
    },

    /**
     * 隐藏冲突弹窗
     */
    hideConflictModal() {
        const modal = document.getElementById('modal-sync-conflict');
        if (modal) {
            modal.classList.remove('active');
        }
        const simpleModal = document.getElementById('modal-sync-simple');
        if (simpleModal) {
            simpleModal.classList.remove('active');
        }
        this.conflictResolveCallback = null;
    },

    /**
     * 显示简化的 Anki 风格冲突弹窗
     */
    showSimpleConflictModal(localData, remoteData, conflict) {
        const modal = document.getElementById('modal-sync-simple');
        if (!modal) {
            // 如果简化弹窗不存在，使用原来的弹窗
            this.showConflictModal(localData, remoteData, conflict);
            return;
        }

        const self = this;  // 保存 this 引用

        // 计算积分差异摘要
        const user77Name = typeof Utils !== 'undefined' ? Utils.getUserName('user77') : '77';
        const user11Name = typeof Utils !== 'undefined' ? Utils.getUserName('user11') : '11';

        const localUser77 = localData.points?.user77?.total || 0;
        const localUser11 = localData.points?.user11?.total || 0;
        const remoteUser77 = remoteData.points?.user77?.total || 0;
        const remoteUser11 = remoteData.points?.user11?.total || 0;

        // 更新弹窗内容
        const localSummary = modal.querySelector('.sync-local-summary');
        const remoteSummary = modal.querySelector('.sync-remote-summary');
        const reasonEl = modal.querySelector('.sync-reason');

        if (localSummary) {
            localSummary.innerHTML = `${user77Name}: ${localUser77}分 | ${user11Name}: ${localUser11}分`;
        }
        if (remoteSummary) {
            remoteSummary.innerHTML = `${user77Name}: ${remoteUser77}分 | ${user11Name}: ${remoteUser11}分`;
        }

        // 显示最近修改原因
        if (reasonEl) {
            const recentHistory = (remoteData.history || []).slice(0, 1);
            if (recentHistory.length > 0) {
                const latest = recentHistory[0];
                reasonEl.innerHTML = `最近变更: ${latest.title || latest.detail || '未知'}`;
                reasonEl.style.display = 'block';
            } else {
                reasonEl.style.display = 'none';
            }
        }

        // 移除旧的事件监听器（克隆节点）
        const btnLocal = modal.querySelector('.sync-btn-local');
        const btnRemote = modal.querySelector('.sync-btn-remote');

        const newBtnLocal = btnLocal.cloneNode(true);
        const newBtnRemote = btnRemote.cloneNode(true);
        btnLocal.parentNode.replaceChild(newBtnLocal, btnLocal);
        btnRemote.parentNode.replaceChild(newBtnRemote, btnRemote);

        // 绑定新的事件 - 直接调用设置页的同步函数
        newBtnLocal.addEventListener('click', async function() {
            modal.classList.remove('active');
            // 调用设置页的本地覆盖云端按钮功能
            const btn = newBtnLocal;
            btn.disabled = true;
            btn.textContent = '处理中...';

            try {
                const success = await self.forceUpload(false);
                if (success) {
                    UI.showToast('已使用本地数据', 'success');
                }
            } catch (e) {
                console.error('上传失败:', e);
                UI.showToast('上传失败', 'error');
            } finally {
                self.updateStatus(true);
                btn.disabled = false;
                if (typeof App !== 'undefined' && App.refresh) App.refresh();
            }
        });

        newBtnRemote.addEventListener('click', async function() {
            modal.classList.remove('active');
            // 调用设置页的云端覆盖本地按钮功能
            const btn = newBtnRemote;
            btn.disabled = true;
            btn.textContent = '处理中...';

            try {
                const success = await self.forceDownload(false);
                if (success) {
                    UI.showToast('已使用云端数据', 'success');
                }
            } catch (e) {
                console.error('下载失败:', e);
                UI.showToast('下载失败', 'error');
            } finally {
                self.updateStatus(true);
                btn.disabled = false;
                if (typeof App !== 'undefined' && App.refresh) App.refresh();
            }
        });

        // 显示弹窗
        modal.classList.add('active');
    },

    /**
     * 格式化数据用于显示
     * @param {object} data
     * @param {string} side - 'local' 或 'remote'
     * @param {object} conflict
     * @returns {string} HTML
     */
    formatDataForDisplay(data, side, conflict) {
        const user77Name = typeof Utils !== 'undefined' ? Utils.getUserName('user77') : '77';
        const user11Name = typeof Utils !== 'undefined' ? Utils.getUserName('user11') : '11';

        const user77Total = data.points?.user77?.total || 0;
        const user11Total = data.points?.user11?.total || 0;

        const highlight77 = conflict.points.user77 ? 'highlight' : '';
        const highlight11 = conflict.points.user11 ? 'highlight' : '';

        return `
            <div class="conflict-data-item">
                <span class="label">${user77Name}</span>
                <span class="value ${highlight77}">${user77Total} 分</span>
            </div>
            <div class="conflict-data-item">
                <span class="label">${user11Name}</span>
                <span class="value ${highlight11}">${user11Total} 分</span>
            </div>
            <div class="conflict-data-item">
                <span class="label">历史记录</span>
                <span class="value">${(data.history || []).length} 条</span>
            </div>
        `;
    },

    /**
     * 解决冲突
     * @param {string} choice - 'local', 'remote', 'merge'
     * @param {object} remoteData
     */
    async resolveConflict(choice, remoteData) {
        try {
            switch (choice) {
                case 'local':
                    await this.forceUpload(false);
                    UI.showToast('已使用本地数据覆盖云端', 'success');
                    break;
                case 'remote':
                    await this.forceDownload(false);
                    UI.showToast('已使用云端数据覆盖本地', 'success');
                    break;
                case 'merge':
                    await this.mergeAndSync(remoteData);
                    UI.showToast('已智能合并数据', 'success');
                    break;
            }
        } finally {
            // 无论成功失败都更新状态为在线
            this.updateStatus(true);
        }

        // 刷新页面显示
        if (typeof App !== 'undefined' && App.refresh) {
            App.refresh();
        }
    },

    /**
     * 合并数据并同步
     * @param {object} remoteData
     */
    async mergeAndSync(remoteData) {
        // 合并 penalty 数据（VPS 脚本写入的）- 优先使用远程数据
        if (remoteData.penalty) {
            Store.data.penalty = Store.data.penalty || {};
            for (const userId of ['user77', 'user11']) {
                const localPenalty = Store.data.penalty[userId] || {};
                const remotePenalty = remoteData.penalty[userId] || {};

                // 如果远程有更新的结算记录，使用远程数据
                if (remotePenalty.lastCheckDate &&
                    (!localPenalty.lastCheckDate || remotePenalty.lastCheckDate >= localPenalty.lastCheckDate)) {
                    Store.data.penalty[userId] = remotePenalty;
                }
            }
        }

        // 合并 history（去重）
        if (remoteData.history && Array.isArray(remoteData.history)) {
            const localHistory = Store.data.history || [];
            const remoteHistory = remoteData.history;
            Store.data.history = this.mergeHistory(localHistory, remoteHistory);
        }

        // 合并 points - 检测是否有 VPS 惩罚扣分
        if (remoteData.points) {
            for (const userId of ['user77', 'user11']) {
                if (remoteData.points[userId] && Store.data.points[userId]) {
                    const localPenalty = Store.data.penalty?.[userId] || {};
                    const remotePenalty = remoteData.penalty?.[userId] || {};

                    // 如果远程有更新的惩罚记录，接受远程积分（即使更低，因为是被扣分了）
                    const remotePenaltyIsNewer = remotePenalty.lastCheckDate &&
                        (!localPenalty.lastCheckDate || remotePenalty.lastCheckDate > localPenalty.lastCheckDate);

                    if (remotePenaltyIsNewer) {
                        // VPS 执行了扣分，接受远程积分
                        console.log(`[Firebase] 检测到 ${userId} 有新的惩罚记录，接受远程积分`);
                        Store.data.points[userId].total = remoteData.points[userId].total;
                        Store.data.points[userId].weekly = remoteData.points[userId].weekly;
                    } else {
                        // 无新惩罚，取较大值（正常加分场景）
                        if (remoteData.points[userId].total > Store.data.points[userId].total) {
                            Store.data.points[userId].total = remoteData.points[userId].total;
                        }
                        if (remoteData.points[userId].weekly > Store.data.points[userId].weekly) {
                            Store.data.points[userId].weekly = remoteData.points[userId].weekly;
                        }
                    }
                }
            }
        }

        // 合并其他数据
        const fieldsToMerge = ['bounties', 'taskPool', 'dailyTasks', 'taskStreaks', 'stats', 'starLevels', 'taskSlots', 'systemBountyWeekly'];
        for (const field of fieldsToMerge) {
            if (remoteData[field] && !Store.data[field]) {
                Store.data[field] = remoteData[field];
            }
        }

        // 更新同步时间并上传
        const syncTime = new Date().toISOString();
        this.lastUploadTime = syncTime;
        Store.data.system = Store.data.system || {};
        Store.data.system.lastSync = syncTime;

        const dataRef = this.ref(this.database, 'pointSystemV3');
        await this.set(dataRef, Store.data);

        Store.save();
        this.lastSyncTime = new Date();
        this.updateSyncTimeDisplay();
    },

    /**
     * 确认后强制上传（本地覆盖云端）
     */
    confirmForceUpload() {
        if (typeof Modal !== 'undefined' && Modal.confirm) {
            Modal.confirm(
                '确认覆盖云端数据？',
                '本地数据将完全覆盖云端数据，此操作不可撤销。',
                () => this.forceUpload(true)
            );
        } else {
            if (confirm('确认用本地数据覆盖云端？此操作不可撤销。')) {
                this.forceUpload(true);
            }
        }
    },

    /**
     * 强制上传本地数据到云端
     * @param {boolean} showToast - 是否显示提示
     */
    async forceUpload(showToast = true) {
        if (!this.isOnline || !this.database || !this.set || !this.ref) {
            UI.showToast('无法连接到服务器', 'error');
            return false;
        }

        try {
            this.showSyncingStatus();

            const syncTime = new Date().toISOString();
            this.lastUploadTime = syncTime;
            Store.data.system = Store.data.system || {};
            Store.data.system.lastSync = syncTime;

            const dataRef = this.ref(this.database, 'pointSystemV3');
            await this.set(dataRef, Store.data);

            Store.save();
            this.lastSyncTime = new Date();
            this.updateSyncTimeDisplay();

            if (showToast) {
                UI.showToast('本地数据已上传到云端', 'success');
            }

            this.updateStatus(true);
            return true;
        } catch (e) {
            console.error('[Firebase] 上传失败:', e);
            UI.showToast('上传失败: ' + e.message, 'error');
            this.updateStatus(true);
            return false;
        }
    },

    /**
     * 确认后强制下载（云端覆盖本地）
     */
    confirmForceDownload() {
        if (typeof Modal !== 'undefined' && Modal.confirm) {
            Modal.confirm(
                '确认覆盖本地数据？',
                '云端数据将完全覆盖本地数据，此操作不可撤销。',
                () => this.forceDownload(true)
            );
        } else {
            if (confirm('确认用云端数据覆盖本地？此操作不可撤销。')) {
                this.forceDownload(true);
            }
        }
    },

    /**
     * 强制从 Firebase 下载数据
     * @param {boolean} showToast - 是否显示提示
     */
    async forceDownload(showToast = true) {
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

                if (showToast) {
                    UI.showToast('云端数据已下载到本地', 'success');
                }

                if (typeof App !== 'undefined' && App.refresh) {
                    App.refresh();
                }

                this.updateStatus(true);
                return true;
            } else {
                UI.showToast('云端无数据', 'warning');
                this.updateStatus(true);
                return false;
            }
        } catch (e) {
            console.error('[Firebase] 下载失败:', e);
            UI.showToast('下载失败: ' + e.message, 'error');
            this.updateStatus(true);
            return false;
        }
    },

    /**
     * 积分变化时触发同步（供其他模块调用）
     */
    onPointsChanged() {
        // 延迟同步，避免频繁触发
        if (this.syncTimeout) {
            clearTimeout(this.syncTimeout);
        }
        this.syncTimeout = setTimeout(() => {
            this.quietSync();
        }, 2000);
    },

    /**
     * 静默同步（不显示冲突弹窗，直接合并）
     */
    async quietSync() {
        if (!this.isOnline || !this.database || !this.get || !this.ref || this.isSyncing) {
            return;
        }

        try {
            const dataRef = this.ref(this.database, 'pointSystemV3');
            const snapshot = await this.get(dataRef);
            const remoteData = snapshot.val();

            if (remoteData) {
                await this.mergeAndSync(remoteData);
            } else {
                await this.forceUpload(false);
            }

            console.log('[Firebase] 静默同步完成');
        } catch (e) {
            console.error('[Firebase] 静默同步失败:', e);
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

        // 先添加远程历史
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
     * 兼容旧的 sync 方法
     */
    async sync() {
        return this.smartSync();
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
