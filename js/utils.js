/**
 * utils.js - 工具函数
 *
 * 通用辅助函数集合
 */

const Utils = {
    /**
     * 生成唯一 ID
     * @returns {string} 唯一标识符
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    /**
     * 格式化日期
     * @param {Date|string|number} date - 日期
     * @param {string} format - 格式 (默认 'YYYY-MM-DD HH:mm')
     * @returns {string} 格式化后的日期字符串
     */
    formatDate(date, format = 'YYYY-MM-DD HH:mm') {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '--';

        const pad = (n) => n.toString().padStart(2, '0');

        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        const seconds = pad(d.getSeconds());

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    },

    /**
     * 获取今天的日期字符串 (YYYY-MM-DD)
     * @returns {string}
     */
    getTodayString() {
        return this.formatDate(new Date(), 'YYYY-MM-DD');
    },

    /**
     * 获取本周开始日期 (周一)
     * @param {Date} date - 参考日期
     * @returns {Date}
     */
    getWeekStart(date = new Date()) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    },

    /**
     * 获取本周开始日期字符串
     * @returns {string}
     */
    getWeekStartString() {
        return this.formatDate(this.getWeekStart(), 'YYYY-MM-DD');
    },

    /**
     * 计算剩余时间文本
     * @param {Date|string|number} deadline - 截止时间
     * @returns {object} { text: string, isUrgent: boolean, isExpired: boolean }
     */
    getTimeRemaining(deadline) {
        const now = new Date();
        const end = new Date(deadline);
        const diff = end - now;

        if (diff <= 0) {
            return { text: '已过期', isUrgent: false, isExpired: true };
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hours >= 24) {
            const days = Math.floor(hours / 24);
            return { text: `${days}天后`, isUrgent: false, isExpired: false };
        }

        if (hours > 0) {
            return { text: `${hours}小时${minutes}分`, isUrgent: hours < 3, isExpired: false };
        }

        return { text: `${minutes}分钟`, isUrgent: true, isExpired: false };
    },

    /**
     * 获取用户显示名称
     * @param {string} userId - 用户 ID
     * @returns {string}
     */
    getUserName(userId) {
        if (!userId) return '未知';
        if (userId === 'system') return '系统';
        const user = CONFIG.USERS[userId];
        return user ? user.name : userId;
    },

    /**
     * 获取用户头像
     * @param {string} userId - 用户 ID
     * @returns {string}
     */
    getUserAvatar(userId) {
        if (!userId) return '❓';
        if (userId === 'system') return '⚙️';
        const user = CONFIG.USERS[userId];
        return user ? user.avatar : '👤';
    },

    /**
     * 深拷贝对象
     * @param {any} obj - 要拷贝的对象
     * @returns {any}
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (obj instanceof Object) {
            const copy = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    copy[key] = this.deepClone(obj[key]);
                }
            }
            return copy;
        }
        return obj;
    },

    /**
     * 防抖函数
     * @param {Function} func - 要防抖的函数
     * @param {number} wait - 等待时间 (毫秒)
     * @returns {Function}
     */
    debounce(func, wait = 300) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },

    /**
     * 节流函数
     * @param {Function} func - 要节流的函数
     * @param {number} limit - 限制时间 (毫秒)
     * @returns {Function}
     */
    throttle(func, limit = 300) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * 生成星星显示 HTML
     * @param {number} points - 积分
     * @returns {string} HTML 字符串
     */
    generateStarsHTML(points) {
        if (points <= 0) return '<span class="no-stars">-</span>';

        const { SMALL, BIG, RAINBOW } = CONFIG.STAR_THRESHOLDS;

        const rainbowCount = Math.floor(points / RAINBOW);
        let remaining = points % RAINBOW;

        const bigCount = Math.floor(remaining / BIG);
        remaining = remaining % BIG;

        const smallCount = Math.floor(remaining / SMALL);

        let html = '';

        // 彩虹星
        for (let i = 0; i < rainbowCount; i++) {
            html += '<span class="star star-rainbow">⭐</span>';
        }

        // 大星星
        for (let i = 0; i < bigCount; i++) {
            html += '<span class="star star-big">⭐</span>';
        }

        // 小星星
        for (let i = 0; i < smallCount; i++) {
            html += '<span class="star star-small">⭐</span>';
        }

        return html || '<span class="no-stars">-</span>';
    },

    /**
     * 计算连续天数倍率
     * @param {number} streakDays - 连续天数
     * @returns {number} 倍率
     */
    getStreakMultiplier(streakDays) {
        if (streakDays >= 14) return CONFIG.STREAK_MULTIPLIERS[14];
        if (streakDays >= 7) return CONFIG.STREAK_MULTIPLIERS[7];
        if (streakDays >= 3) return CONFIG.STREAK_MULTIPLIERS[3];
        return 1;
    },

    /**
     * 安全的 JSON 解析
     * @param {string} str - JSON 字符串
     * @param {any} defaultValue - 解析失败时的默认值
     * @returns {any}
     */
    safeJsonParse(str, defaultValue = null) {
        try {
            return JSON.parse(str);
        } catch (e) {
            console.warn('JSON 解析失败:', e);
            return defaultValue;
        }
    },

    /**
     * 检查是否为今天
     * @param {Date|string} date - 日期
     * @returns {boolean}
     */
    isToday(date) {
        const today = new Date();
        const d = new Date(date);
        return d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate();
    },

    /**
     * 检查是否为本周
     * @param {Date|string} date - 日期
     * @returns {boolean}
     */
    isThisWeek(date) {
        const weekStart = this.getWeekStart();
        const d = new Date(date);
        return d >= weekStart;
    }
};

// 导出到全局
window.Utils = Utils;
