/**
 * config.js - 应用配置
 *
 * 包含 Firebase 配置、系统常量、用户定义等
 */

const CONFIG = {
    // 应用信息
    APP_NAME: '积分管理系统',
    VERSION: '3.0.0',

    // 用户配置
    USERS: {
        user77: {
            id: 'user77',
            name: '77',
            avatar: '',
            color: '#2196f3'
        },
        user11: {
            id: 'user11',
            name: '11',
            avatar: '',
            color: '#ffc107'
        }
    },

    // 每日任务配置
    DEFAULT_TASK_SLOTS: 3,         // 默认任务槽数量
    MAX_DAILY_TASKS: 5,            // 每天最多算几个任务
    TASK_SLOT_PRICE: 500,          // 购买任务槽价格
    TASK_SLOT_UNLOCK_STARS: 2,     // 解锁购买任务槽需要的星星数
    DEFAULT_TASK_POINTS: 1,        // 任务默认积分

    // 每日完成奖励
    DAILY_BONUS: {
        THREE_TASKS: 1,            // 完成3个任务额外+1分
        FIVE_TASKS: 2              // 完成5个任务再额外+2分
    },

    // 星星升级配置
    STAR_MAX_LEVEL: 99,            // 最高等级
    STAR_UPGRADE_COSTS: [500, 1000, 2000, 4000, 10000], // 1-5级费用，5级后固定10000
    STAR_POINTS_PER_TWO: 1,        // 每2颗星星增加的任务积分

    // 悬赏状态（简化：完成即结算，去掉 DONE 状态）
    BOUNTY_STATUS: {
        OPEN: 'open',         // 待接取
        TAKEN: 'taken',       // 进行中
        SETTLED: 'settled',   // 已完成（自动结算）
        EXPIRED: 'expired'    // 已过期
    },

    // 系统悬赏（长期悬赏）配置
    SYSTEM_BOUNTY: {
        WEEKLY_LIMIT: 3,      // 每人每周最多完成次数
        WEEK_START_HOUR: 6    // 周起始时间（周一 6:00）
    },

    // 管理密码
    ADMIN_PASSWORD: '240310',

    // Firebase 配置
    FIREBASE: {
        apiKey: "AIzaSyCI2ksv8LV88v7wKIj9-2a-QfUl1vbD8JA",
        authDomain: "points-reward-system.firebaseapp.com",
        databaseURL: "https://points-reward-system-default-rtdb.firebaseio.com",
        projectId: "points-reward-system",
        storageBucket: "points-reward-system.firebasestorage.app",
        messagingSenderId: "655875805786",
        appId: "1:655875805786:web:c69c29e0dc2d32b50d7e63",
        measurementId: "G-QXGLX0KW5E"
    },

    // 本地存储 key
    STORAGE_KEY: 'points_system_v3',

    // 自动同步间隔 (毫秒)
    AUTO_SYNC_INTERVAL: 30000,

    // Toast 显示时长 (毫秒)
    TOAST_DURATION: 2000
};

/**
 * 获取星星升级费用
 * @param {number} currentLevel - 当前等级 (0-98)
 * @returns {number} 升级所需积分
 */
CONFIG.getUpgradeCost = function(currentLevel) {
    if (currentLevel >= this.STAR_MAX_LEVEL) return Infinity;
    if (currentLevel < 5) {
        return this.STAR_UPGRADE_COSTS[currentLevel];
    }
    return this.STAR_UPGRADE_COSTS[4]; // 5级后固定10000
};

/**
 * 根据星星等级计算任务额外积分
 * @param {number} starLevel - 星星等级
 * @returns {number} 额外积分
 */
CONFIG.getStarBonus = function(starLevel) {
    return Math.floor(starLevel / 2) * this.STAR_POINTS_PER_TWO;
};

// 冻结配置防止意外修改
Object.freeze(CONFIG.USERS);
Object.freeze(CONFIG.BOUNTY_STATUS);
Object.freeze(CONFIG.SYSTEM_BOUNTY);
Object.freeze(CONFIG.FIREBASE);
Object.freeze(CONFIG.DAILY_BONUS);
Object.freeze(CONFIG.STAR_UPGRADE_COSTS);
