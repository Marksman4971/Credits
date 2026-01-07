/**
 * penalty-checker.js - VPS 惩罚自动结算脚本
 *
 * 使用方法：
 * 1. 上传到 VPS
 * 2. npm install firebase-admin
 * 3. 设置 Cron: 0 23 * * * node /path/to/penalty-checker.js
 *
 * 惩罚类型：
 * - 每日任务：每天23:00检查，未完成3个任务扣分
 * - 周期任务：
 *   - 周任务：周日23:00检查，未完成扣10分
 *   - 月任务：月末23:00检查，未完成扣30分
 *   - 年任务：12/31 23:00检查，未完成扣70分
 */

const admin = require('firebase-admin');

// Firebase 配置
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://points-reward-system-default-rtdb.firebaseio.com'
});

const db = admin.database();
const DATA_PATH = '/pointSystemV3';  // 与网页端一致的数据路径

// 惩罚配置
const CONFIG = {
    MIN_TASKS: 3,           // 最少需要完成的任务数
    POINTS_PER_MISS: 3,     // 每少一个任务扣的分
    MAX_DAILY_PENALTY: 100, // 单日最大扣分
    USERS: ['user77', 'user11'],
    // 周期任务惩罚
    PERIODIC_PENALTY: {
        week: 10,   // 周任务未完成扣10分
        month: 30,  // 月任务未完成扣30分
        year: 70    // 年任务未完成扣70分
    }
};

/**
 * 获取今天的日期字符串 (YYYY-MM-DD)
 */
function getTodayString() {
    const now = new Date();
    // 使用中国时区
    const chinaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const year = chinaTime.getFullYear();
    const month = String(chinaTime.getMonth() + 1).padStart(2, '0');
    const day = String(chinaTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 计算应扣分数
 */
function calculatePenalty(completed, streak) {
    if (completed >= CONFIG.MIN_TASKS) {
        return 0;
    }

    const missed = CONFIG.MIN_TASKS - completed;
    const basePenalty = missed * CONFIG.POINTS_PER_MISS;

    // 连续天数倍率：2^streak，但第一天不翻倍
    const multiplier = streak > 0 ? Math.pow(2, streak) : 1;
    const totalPenalty = basePenalty * multiplier;

    return Math.min(totalPenalty, CONFIG.MAX_DAILY_PENALTY);
}

/**
 * 获取中国时间
 */
function getChinaTime() {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
}

/**
 * 检查是否是周日（需要检查周任务）
 */
function isSunday() {
    return getChinaTime().getDay() === 0;
}

/**
 * 检查是否是月末（需要检查月任务）
 */
function isLastDayOfMonth() {
    const now = getChinaTime();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return tomorrow.getDate() === 1;
}

/**
 * 检查是否是12月31日（需要检查年任务）
 */
function isYearEnd() {
    const now = getChinaTime();
    return now.getMonth() === 11 && now.getDate() === 31;
}

/**
 * 获取当前周的标识（用于防止重复检查）
 */
function getCurrentWeekId() {
    const now = getChinaTime();
    const year = now.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const week = Math.ceil((((now - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
    return `${year}-W${week}`;
}

/**
 * 获取当前月的标识
 */
function getCurrentMonthId() {
    const now = getChinaTime();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 获取当前年的标识
 */
function getCurrentYearId() {
    return String(getChinaTime().getFullYear());
}

/**
 * 主函数：检查并执行惩罚
 */
async function checkAndApplyPenalty() {
    const today = getTodayString();
    const forceMode = process.argv.includes('--force');

    console.log(`[${new Date().toISOString()}] 开始惩罚检查，日期: ${today}${forceMode ? ' (强制模式)' : ''}`);

    try {
        // 获取所有数据（使用正确的路径）
        const snapshot = await db.ref(DATA_PATH).once('value');
        const data = snapshot.val() || {};

        let hasChanges = false;
        const history = data.history || [];

        for (const userId of CONFIG.USERS) {
            console.log(`\n检查用户: ${userId}`);

            // 获取用户惩罚数据
            const penaltyData = data.penalty?.[userId] || { streak: 0, lastCheckDate: null };

            // 检查是否已经结算过今天（强制模式跳过此检查）
            if (!forceMode && penaltyData.lastCheckDate === today) {
                console.log(`  - 今日已结算，跳过`);
                continue;
            }

            // 获取今日完成的任务数
            const dailyTasks = data.dailyTasks?.[userId] || { slots: [], lastDate: null };
            let completed = 0;

            if (dailyTasks.lastDate === today) {
                const slots = dailyTasks.slots || [];
                completed = slots.filter(s => s?.completed).length;
            }

            console.log(`  - 今日完成任务: ${completed}/${CONFIG.MIN_TASKS}`);

            const isSafe = completed >= CONFIG.MIN_TASKS;

            if (isSafe) {
                // 达标，重置连续天数
                data.penalty = data.penalty || {};
                data.penalty[userId] = {
                    streak: 0,
                    lastCheckDate: today
                };
                console.log(`  - 达标，连续天数重置`);
            } else {
                // 未达标，执行惩罚
                const newStreak = penaltyData.streak + 1;
                const penalty = calculatePenalty(completed, penaltyData.streak);

                // 扣分
                const currentPoints = data.points?.[userId] || { total: 0, weekly: 0 };
                data.points = data.points || {};
                data.points[userId] = {
                    total: Math.max(0, currentPoints.total - penalty),
                    weekly: currentPoints.weekly  // 周积分不扣减
                };

                // 更新惩罚数据
                data.penalty = data.penalty || {};
                data.penalty[userId] = {
                    streak: newStreak,
                    lastCheckDate: today
                };

                // 添加历史记录
                const userName = userId === 'user77' ? '77' : '11';
                history.unshift({
                    id: `penalty_${Date.now()}_${userId}`,
                    time: new Date().toISOString(),
                    type: 'penalty',
                    action: 'deduct',
                    title: '惩罚扣分 (自动)',
                    detail: `${userName} 完成 ${completed}/${CONFIG.MIN_TASKS} 任务，连续第 ${newStreak} 天未达标`,
                    user: userId,
                    points: -penalty
                });

                console.log(`  - 未达标！扣除 ${penalty} 分，连续第 ${newStreak} 天`);
                hasChanges = true;
            }
        }

        // ======== 周期任务惩罚检查 ========
        const bounties = data.bounties || [];
        const periodicPenaltyData = data.periodicPenalty || {};

        // 检查周任务（周日）
        if (isSunday() || forceMode) {
            const weekId = getCurrentWeekId();
            const weekTasks = bounties.filter(b => b.period === 'week' && b.status !== 'settled');

            if (weekTasks.length > 0) {
                console.log(`\n检查周任务 (${weekId}):`);

                for (const task of weekTasks) {
                    // 检查是否已经处罚过这个周期
                    const checkKey = `week_${task.id}_${weekId}`;
                    if (!forceMode && periodicPenaltyData[checkKey]) {
                        console.log(`  - 任务「${task.title}」本周已检查`);
                        continue;
                    }

                    const penalty = CONFIG.PERIODIC_PENALTY.week;
                    const targetUser = task.assignee || null;

                    if (targetUser) {
                        // 已分配：扣分给接取人
                        const currentPoints = data.points?.[targetUser] || { total: 0 };
                        data.points[targetUser].total = Math.max(0, currentPoints.total - penalty);

                        const userName = targetUser === 'user77' ? '77' : '11';
                        history.unshift({
                            id: `periodic_${Date.now()}_${targetUser}`,
                            time: new Date().toISOString(),
                            type: 'penalty',
                            action: 'periodic',
                            title: `周任务未完成`,
                            detail: `${userName} 未完成「${task.title}」`,
                            user: targetUser,
                            points: -penalty
                        });
                        console.log(`  - 「${task.title}」未完成，${userName} 扣 ${penalty} 分`);
                    } else {
                        // 未分配：两人都扣分
                        for (const userId of CONFIG.USERS) {
                            const currentPoints = data.points?.[userId] || { total: 0 };
                            data.points[userId] = data.points[userId] || { total: 0 };
                            data.points[userId].total = Math.max(0, currentPoints.total - penalty);

                            const userName = userId === 'user77' ? '77' : '11';
                            history.unshift({
                                id: `periodic_${Date.now()}_${userId}`,
                                time: new Date().toISOString(),
                                type: 'penalty',
                                action: 'periodic',
                                title: `周任务未完成`,
                                detail: `「${task.title}」无人接取，${userName} 扣分`,
                                user: userId,
                                points: -penalty
                            });
                        }
                        console.log(`  - 「${task.title}」无人接取，两人各扣 ${penalty} 分`);
                    }

                    // 标记已检查
                    periodicPenaltyData[checkKey] = today;
                    hasChanges = true;
                }
            }
        }

        // 检查月任务（月末）
        if (isLastDayOfMonth() || forceMode) {
            const monthId = getCurrentMonthId();
            const monthTasks = bounties.filter(b => b.period === 'month' && b.status !== 'settled');

            if (monthTasks.length > 0) {
                console.log(`\n检查月任务 (${monthId}):`);

                for (const task of monthTasks) {
                    const checkKey = `month_${task.id}_${monthId}`;
                    if (!forceMode && periodicPenaltyData[checkKey]) {
                        console.log(`  - 任务「${task.title}」本月已检查`);
                        continue;
                    }

                    const penalty = CONFIG.PERIODIC_PENALTY.month;
                    const targetUser = task.assignee || null;

                    if (targetUser) {
                        const currentPoints = data.points?.[targetUser] || { total: 0 };
                        data.points[targetUser].total = Math.max(0, currentPoints.total - penalty);

                        const userName = targetUser === 'user77' ? '77' : '11';
                        history.unshift({
                            id: `periodic_${Date.now()}_${targetUser}`,
                            time: new Date().toISOString(),
                            type: 'penalty',
                            action: 'periodic',
                            title: `月任务未完成`,
                            detail: `${userName} 未完成「${task.title}」`,
                            user: targetUser,
                            points: -penalty
                        });
                        console.log(`  - 「${task.title}」未完成，${userName} 扣 ${penalty} 分`);
                    } else {
                        for (const userId of CONFIG.USERS) {
                            const currentPoints = data.points?.[userId] || { total: 0 };
                            data.points[userId] = data.points[userId] || { total: 0 };
                            data.points[userId].total = Math.max(0, currentPoints.total - penalty);

                            const userName = userId === 'user77' ? '77' : '11';
                            history.unshift({
                                id: `periodic_${Date.now()}_${userId}`,
                                time: new Date().toISOString(),
                                type: 'penalty',
                                action: 'periodic',
                                title: `月任务未完成`,
                                detail: `「${task.title}」无人接取，${userName} 扣分`,
                                user: userId,
                                points: -penalty
                            });
                        }
                        console.log(`  - 「${task.title}」无人接取，两人各扣 ${penalty} 分`);
                    }

                    periodicPenaltyData[checkKey] = today;
                    hasChanges = true;
                }
            }
        }

        // 检查年任务（12月31日）
        if (isYearEnd() || forceMode) {
            const yearId = getCurrentYearId();
            const yearTasks = bounties.filter(b => b.period === 'year' && b.status !== 'settled');

            if (yearTasks.length > 0) {
                console.log(`\n检查年任务 (${yearId}):`);

                for (const task of yearTasks) {
                    const checkKey = `year_${task.id}_${yearId}`;
                    if (!forceMode && periodicPenaltyData[checkKey]) {
                        console.log(`  - 任务「${task.title}」本年已检查`);
                        continue;
                    }

                    const penalty = CONFIG.PERIODIC_PENALTY.year;
                    const targetUser = task.assignee || null;

                    if (targetUser) {
                        const currentPoints = data.points?.[targetUser] || { total: 0 };
                        data.points[targetUser].total = Math.max(0, currentPoints.total - penalty);

                        const userName = targetUser === 'user77' ? '77' : '11';
                        history.unshift({
                            id: `periodic_${Date.now()}_${targetUser}`,
                            time: new Date().toISOString(),
                            type: 'penalty',
                            action: 'periodic',
                            title: `年任务未完成`,
                            detail: `${userName} 未完成「${task.title}」`,
                            user: targetUser,
                            points: -penalty
                        });
                        console.log(`  - 「${task.title}」未完成，${userName} 扣 ${penalty} 分`);
                    } else {
                        for (const userId of CONFIG.USERS) {
                            const currentPoints = data.points?.[userId] || { total: 0 };
                            data.points[userId] = data.points[userId] || { total: 0 };
                            data.points[userId].total = Math.max(0, currentPoints.total - penalty);

                            const userName = userId === 'user77' ? '77' : '11';
                            history.unshift({
                                id: `periodic_${Date.now()}_${userId}`,
                                time: new Date().toISOString(),
                                type: 'penalty',
                                action: 'periodic',
                                title: `年任务未完成`,
                                detail: `「${task.title}」无人接取，${userName} 扣分`,
                                user: userId,
                                points: -penalty
                            });
                        }
                        console.log(`  - 「${task.title}」无人接取，两人各扣 ${penalty} 分`);
                    }

                    periodicPenaltyData[checkKey] = today;
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            // 保留最多 500 条历史
            if (history.length > 500) {
                history.length = 500;
            }

            // 分别更新各个节点（避免被网页全量同步覆盖）
            const updates = {};

            // 更新积分
            for (const userId of CONFIG.USERS) {
                updates[`${DATA_PATH}/points/${userId}`] = data.points[userId];
                updates[`${DATA_PATH}/penalty/${userId}`] = data.penalty[userId];
            }

            // 更新周期惩罚记录
            updates[`${DATA_PATH}/periodicPenalty`] = periodicPenaltyData;

            // 更新历史和系统时间戳
            updates[`${DATA_PATH}/history`] = history;
            updates[`${DATA_PATH}/system/lastSync`] = new Date().toISOString();

            await db.ref().update(updates);
            console.log('\n数据已更新到 Firebase');
        } else {
            // 即使无需扣分，也更新 penalty 状态（标记已检查）
            const updates = {};
            for (const userId of CONFIG.USERS) {
                if (data.penalty?.[userId]) {
                    updates[`${DATA_PATH}/penalty/${userId}`] = data.penalty[userId];
                }
            }
            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
            }
            console.log('\n无需更新');
        }

        console.log('惩罚检查完成\n');
        process.exit(0);

    } catch (error) {
        console.error('执行出错:', error);
        process.exit(1);
    }
}

// 执行
checkAndApplyPenalty();
