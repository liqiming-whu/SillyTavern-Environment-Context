const DAY_MS = 86_400_000;

function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
    return date;
}

function formatDate(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDays(date, count) {
    return new Date(date.getTime() + count * DAY_MS);
}

function diffDays(from, to) {
    return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function positiveInteger(value, fallback, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function calculateCycleStatus(startDate, cycleLength, periodDuration, todayString) {
    const start = parseDate(startDate);
    const today = parseDate(todayString);
    if (!start || !today) return null;
    const length = positiveInteger(cycleLength, 28, 15, 60);
    const duration = positiveInteger(periodDuration, 5, 1, Math.min(14, length));
    const elapsed = diffDays(start, today);
    const cyclesElapsed = elapsed >= 0 ? Math.floor(elapsed / length) : Math.floor(elapsed / length);
    const recentStart = addDays(start, cyclesElapsed * length);
    const dayInCycle = diffDays(recentStart, today);
    const daysToNext = length - dayInCycle;
    let phase = 'luteal';
    let description = '整体状态平稳，但需要比平时更多放松和照顾';
    if (dayInCycle < duration) {
        phase = 'menstruation';
        description = `今天身体偏虚一些（第${dayInCycle + 1}天），耐受和体力会下降`;
    } else if (dayInCycle < duration + 7) {
        phase = 'follicular';
        description = '最近恢复得不错，精力和心情都在慢慢回升';
    } else if (dayInCycle < duration + 10) {
        phase = 'ovulation';
        description = '今天整体状态偏好，体力与兴致都更积极';
    } else if (daysToNext <= 5) {
        phase = 'pms';
        description = '这几天会更敏感些，情绪和身体感受容易起伏';
    }
    return {
        phase,
        recentStartDate: formatDate(recentStart),
        nextStartDate: formatDate(addDays(recentStart, length)),
        dayInCycle,
        cycleLength: length,
        periodDuration: duration,
        description,
    };
}

export function calculatePregnancyStatus(startDate, todayString) {
    const start = parseDate(startDate);
    const today = parseDate(todayString);
    if (!start || !today) return null;
    const days = diffDays(start, today);
    if (days < 0) return null;
    const week = Math.floor(days / 7);
    const trimester = week < 13 ? 1 : week < 28 ? 2 : 3;
    const statusText = week < 13
        ? '孕早期，容易疲倦或轻微不适'
        : week < 28
            ? '孕中期，状态相对稳定'
            : week < 40
                ? '孕晚期，行动负担明显增加'
                : '临近分娩期，需要重点照护';
    return {
        week,
        trimester,
        dueDate: formatDate(addDays(start, 280)),
        statusText,
    };
}

export function collectAnniversaries(settings, todayString) {
    const monthDay = String(todayString || '').slice(5);
    const currentYear = Number(String(todayString || '').slice(0, 4));
    const result = [];
    const builtIns = [
        { name: '{{user}}的生日', date: settings.userBirthday, type: 'birthday' },
        { name: '{{char}}的生日', date: settings.charBirthday, type: 'birthday' },
    ];
    const custom = Array.isArray(settings.anniversaries) ? settings.anniversaries : [];
    for (const event of [...builtIns, ...custom]) {
        const date = String(event?.date || '').trim();
        if (!date || date.slice(-5) !== monthDay) continue;
        const startYear = /^\d{4}-/.test(date) ? Number(date.slice(0, 4)) : 0;
        const years = startYear > 0 && currentYear >= startYear ? currentYear - startYear : null;
        result.push({
            name: String(event?.name || '纪念日').trim().slice(0, 80) || '纪念日',
            type: event?.type === 'birthday' ? 'birthday' : 'anniversary',
            years,
        });
    }
    return result;
}