/**
 * store.js - 数据存储管理
 *
 * 负责本地数据的读取、保存和管理
 */

const Store = {
    // 当前数据
    data: null,

    // 数据变更监听器
    listeners: [],

    /**
     * 初始化数据
     */
    init() {
        this.load();
        console.log('[Store] 初始化完成');
    },

    /**
     * 获取默认数据结构
     * @returns {object}
     */
    getDefaultData() {
        return {
            // 用户积分
            points: {
                user77: { total: 0, weekly: 0 },
                user11: { total: 0, weekly: 0 }
            },

            // 星星等级 (每个用户的星星升级进度)
            starLevels: {
                user77: 0,  // 当前星星等级 (0-99)
                user11: 0
            },

            // 任务槽数量 (每个用户拥有的任务槽)
            taskSlots: {
                user77: CONFIG.DEFAULT_TASK_SLOTS,  // 默认3个
                user11: CONFIG.DEFAULT_TASK_SLOTS
            },

            // 悬赏任务列表
            bounties: [],

            // 任务池
            taskPool: [],

            // 每日任务
            dailyTasks: {
                user77: { slots: [], completed: 0, lastDate: null },
                user11: { slots: [], completed: 0, lastDate: null }
            },

            // 任务连续天数记录
            taskStreaks: {
                user77: {},  // { taskId: { count: 0, lastDate: '' } }
                user11: {}
            },

            // 历史记录
            history: [],

            // 统计数据
            stats: {
                user77: {
                    weeklyTasks: 0,
                    weeklyBounties: 0,
                    weekStart: null
                },
                user11: {
                    weeklyTasks: 0,
                    weeklyBounties: 0,
                    weekStart: null
                }
            },

            // 惩罚数据
            penalty: {
                user77: { streak: 0, lastCheckDate: null },
                user11: { streak: 0, lastCheckDate: null }
            },

            // 系统悬赏周完成次数追踪
            systemBountyWeekly: {
                user77: { count: 0, weekStart: null },
                user11: { count: 0, weekStart: null }
            },

            // 系统信息
            system: {
                lastSync: null,
                version: CONFIG.VERSION,
                weekStart: null,
                lastPenaltyCheck: null
            }
        };
    },

    /**
     * 从本地存储加载数据
     */
    load() {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (saved) {
            const parsed = Utils.safeJsonParse(saved);
            if (parsed) {
                // 合并默认数据和保存的数据，确保结构完整
                this.data = this.mergeData(this.getDefaultData(), parsed);
                console.log('[Store] 从本地加载数据成功');
                return;
            }
        }
        this.data = this.getDefaultData();
        console.log('[Store] 使用默认数据');
    },

    /**
     * 合并数据，保持结构完整
     * @param {object} defaultData - 默认数据
     * @param {object} savedData - 保存的数据
     * @returns {object}
     */
    mergeData(defaultData, savedData) {
        const result = Utils.deepClone(defaultData);

        for (const key in savedData) {
            if (savedData.hasOwnProperty(key)) {
                if (typeof savedData[key] === 'object' && savedData[key] !== null &&
                    typeof result[key] === 'object' && result[key] !== null &&
                    !Array.isArray(savedData[key])) {
                    result[key] = this.mergeData(result[key], savedData[key]);
                } else {
                    result[key] = savedData[key];
                }
            }
        }

        return result;
    },

    /**
     * 保存数据到本地存储
     */
    save() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.data));
            this.notifyListeners('save');
            console.log('[Store] 数据已保存');
        } catch (e) {
            console.error('[Store] 保存失败:', e);
            UI.showToast('数据保存失败', 'error');
        }
    },

    /**
     * 获取数据
     * @param {string} path - 数据路径 (如 'points.qiqi.total')
     * @returns {any}
     */
    get(path) {
        if (!path) return this.data;

        const keys = path.split('.');
        let value = this.data;

        for (const key of keys) {
            if (value === null || value === undefined) return undefined;
            value = value[key];
        }

        return value;
    },

    /**
     * 设置数据
     * @param {string} path - 数据路径
     * @param {any} value - 值
     */
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let target = this.data;

        for (const key of keys) {
            if (target[key] === undefined) {
                target[key] = {};
            }
            target = target[key];
        }

        target[lastKey] = value;
        this.save();
    },

    /**
     * 更新数据 (部分更新)
     * @param {string} path - 数据路径
     * @param {object} updates - 要更新的字段
     */
    update(path, updates) {
        const current = this.get(path);
        if (typeof current === 'object' && current !== null) {
            this.set(path, { ...current, ...updates });
        } else {
            this.set(path, updates);
        }
    },

    /**
     * 添加监听器
     * @param {Function} callback - 回调函数
     */
    addListener(callback) {
        this.listeners.push(callback);
    },

    /**
     * 移除监听器
     * @param {Function} callback - 回调函数
     */
    removeListener(callback) {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    },

    /**
     * 通知所有监听器
     * @param {string} action - 操作类型
     */
    notifyListeners(action) {
        this.listeners.forEach(callback => {
            try {
                callback(action, this.data);
            } catch (e) {
                console.error('[Store] 监听器执行错误:', e);
            }
        });
    },

    /**
     * 用外部数据替换当前数据
     * @param {object} newData - 新数据
     */
    replaceData(newData) {
        this.data = this.mergeData(this.getDefaultData(), newData);
        this.save();
        this.notifyListeners('replace');
    },

    /**
     * 导出数据
     * @returns {string} JSON 字符串
     */
    export() {
        return JSON.stringify(this.data, null, 2);
    },

    /**
     * 导入数据
     * @param {string} jsonStr - JSON 字符串
     * @returns {boolean} 是否成功
     */
    import(jsonStr) {
        const parsed = Utils.safeJsonParse(jsonStr);
        if (parsed) {
            this.replaceData(parsed);
            return true;
        }
        return false;
    },

    /**
     * 重置所有数据
     */
    reset() {
        this.data = this.getDefaultData();
        this.save();
        this.notifyListeners('reset');
    },

    // ========== 积分相关便捷方法 ==========

    /**
     * 获取用户总积分
     * @param {string} userId
     * @returns {number}
     */
    getPoints(userId) {
        return this.get(`points.${userId}.total`) || 0;
    },

    /**
     * 获取用户本周积分
     * @param {string} userId
     * @returns {number}
     */
    getWeeklyPoints(userId) {
        return this.get(`points.${userId}.weekly`) || 0;
    },

    /**
     * 增加积分
     * @param {string} userId
     * @param {number} amount
     */
    addPoints(userId, amount) {
        const current = this.get(`points.${userId}`) || { total: 0, weekly: 0 };
        this.set(`points.${userId}`, {
            total: current.total + amount,
            weekly: current.weekly + amount
        });
    },

    /**
     * 减少积分
     * @param {string} userId
     * @param {number} amount
     */
    deductPoints(userId, amount) {
        const current = this.get(`points.${userId}`) || { total: 0, weekly: 0 };
        this.set(`points.${userId}`, {
            total: Math.max(0, current.total - amount),
            weekly: current.weekly  // 周积分不扣减
        });
    },

    // ========== 悬赏相关便捷方法 ==========

    /**
     * 获取所有悬赏
     * @returns {Array}
     */
    getBounties() {
        return this.get('bounties') || [];
    },

    /**
     * 添加悬赏
     * @param {object} bounty
     */
    addBounty(bounty) {
        const bounties = this.getBounties();
        bounties.unshift(bounty);
        this.set('bounties', bounties);
    },

    /**
     * 更新悬赏
     * @param {string} bountyId
     * @param {object} updates
     */
    updateBounty(bountyId, updates) {
        const bounties = this.getBounties();
        const index = bounties.findIndex(b => b.id === bountyId);
        if (index > -1) {
            bounties[index] = { ...bounties[index], ...updates };
            this.set('bounties', bounties);
        }
    },

    /**
     * 删除悬赏
     * @param {string} bountyId
     */
    deleteBounty(bountyId) {
        const bounties = this.getBounties().filter(b => b.id !== bountyId);
        this.set('bounties', bounties);
    },

    // ========== 历史记录便捷方法 ==========

    /**
     * 添加历史记录
     * @param {object} record
     */
    addHistory(record) {
        const history = this.get('history') || [];
        history.unshift({
            id: Utils.generateId(),
            time: new Date().toISOString(),
            ...record
        });
        // 最多保留 500 条
        if (history.length > 500) {
            history.length = 500;
        }
        this.set('history', history);
    },

    /**
     * 获取历史记录
     * @param {string} type - 可选，筛选类型
     * @returns {Array}
     */
    getHistory(type = null) {
        const history = this.get('history') || [];
        if (type) {
            return history.filter(h => h.type === type);
        }
        return history;
    },

    /**
     * 清空历史记录
     * @param {string} type - 可选，只清空指定类型
     */
    clearHistory(type = null) {
        if (type) {
            const history = this.getHistory().filter(h => h.type !== type);
            this.set('history', history);
        } else {
            this.set('history', []);
        }
    },

    // ========== 星星等级相关便捷方法 ==========

    /**
     * 获取用户星星等级
     * @param {string} userId
     * @returns {number}
     */
    getStarLevel(userId) {
        return this.get(`starLevels.${userId}`) || 0;
    },

    /**
     * 设置用户星星等级
     * @param {string} userId
     * @param {number} level
     */
    setStarLevel(userId, level) {
        this.set(`starLevels.${userId}`, Math.min(level, CONFIG.STAR_MAX_LEVEL));
    },

    /**
     * 升级星星 (自动扣除积分)
     * @param {string} userId
     * @returns {boolean} 是否成功
     */
    upgradeStarLevel(userId) {
        const currentLevel = this.getStarLevel(userId);
        if (currentLevel >= CONFIG.STAR_MAX_LEVEL) return false;

        const cost = CONFIG.getUpgradeCost(currentLevel);
        const points = this.getPoints(userId);

        if (points < cost) return false;

        this.deductPoints(userId, cost);
        this.setStarLevel(userId, currentLevel + 1);

        // 记录历史
        this.addHistory({
            type: 'system',
            title: `${Utils.getUserName(userId)} 星星升级`,
            detail: `升级到 ${currentLevel + 1} 级，花费 ${cost} 积分`,
            points: -cost,
            userId: userId
        });

        return true;
    },

    /**
     * 获取用户任务额外积分 (根据星星等级)
     * @param {string} userId
     * @returns {number}
     */
    getTaskBonus(userId) {
        const starLevel = this.getStarLevel(userId);
        return CONFIG.getStarBonus(starLevel);
    },

    // ========== 任务槽相关便捷方法 ==========

    /**
     * 获取用户任务槽数量
     * @param {string} userId
     * @returns {number}
     */
    getTaskSlots(userId) {
        return this.get(`taskSlots.${userId}`) || CONFIG.DEFAULT_TASK_SLOTS;
    },

    /**
     * 设置用户任务槽数量
     * @param {string} userId
     * @param {number} slots
     */
    setTaskSlots(userId, slots) {
        this.set(`taskSlots.${userId}`, slots);
    },

    /**
     * 购买任务槽 (自动扣除积分)
     * @param {string} userId
     * @returns {boolean} 是否成功
     */
    buyTaskSlot(userId) {
        // 检查是否解锁购买功能
        const starLevel = this.getStarLevel(userId);
        if (starLevel < CONFIG.TASK_SLOT_UNLOCK_STARS) return false;

        const points = this.getPoints(userId);
        if (points < CONFIG.TASK_SLOT_PRICE) return false;

        const currentSlots = this.getTaskSlots(userId);
        this.deductPoints(userId, CONFIG.TASK_SLOT_PRICE);
        this.setTaskSlots(userId, currentSlots + 1);

        // 记录历史
        this.addHistory({
            type: 'system',
            title: `${Utils.getUserName(userId)} 购买任务槽`,
            detail: `任务槽增加到 ${currentSlots + 1} 个，花费 ${CONFIG.TASK_SLOT_PRICE} 积分`,
            points: -CONFIG.TASK_SLOT_PRICE,
            userId: userId
        });

        return true;
    },

    /**
     * 检查用户是否可以购买任务槽
     * @param {string} userId
     * @returns {object} { canBuy, reason }
     */
    canBuyTaskSlot(userId) {
        const starLevel = this.getStarLevel(userId);
        if (starLevel < CONFIG.TASK_SLOT_UNLOCK_STARS) {
            return {
                canBuy: false,
                reason: `需要 ${CONFIG.TASK_SLOT_UNLOCK_STARS} 颗星星才能解锁`
            };
        }

        const points = this.getPoints(userId);
        if (points < CONFIG.TASK_SLOT_PRICE) {
            return {
                canBuy: false,
                reason: `积分不足，需要 ${CONFIG.TASK_SLOT_PRICE} 积分`
            };
        }

        return { canBuy: true, reason: '' };
    }
};

// 导出到全局
window.Store = Store;
