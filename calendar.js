import './vendor/chinese-days.min.js';

const DAY_MS = 86_400_000;
const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const NAGER_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const nagerCache = new Map();

function safeText(value, maxLength = 120) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseLocalDate(dateString) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || ''));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
    return date;
}

export function formatLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addDays(dateString, amount) {
    const date = parseLocalDate(dateString);
    if (!date) return '';
    date.setDate(date.getDate() + amount);
    return formatLocalDate(date);
}

function dayDifference(from, to) {
    const left = parseLocalDate(from);
    const right = parseLocalDate(to);
    if (!left || !right) return 0;
    return Math.round((Date.UTC(right.getFullYear(), right.getMonth(), right.getDate()) - Date.UTC(left.getFullYear(), left.getMonth(), left.getDate())) / DAY_MS);
}

function holidayNames(detail) {
    const raw = safeText(detail?.name || '', 160);
    if (!raw || /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(raw)) return { name: '', localName: '' };
    const parts = raw.split(',').map(item => safeText(item, 80)).filter(Boolean);
    return { name: parts[0] || raw, localName: parts[1] || parts[0] || raw };
}

function lunarText(chineseDays, dateString) {
    try {
        const lunar = chineseDays?.getLunarDate?.(dateString);
        if (!lunar) return '';
        return `${lunar.isLeap ? '闰' : ''}${safeText(lunar.lunarMonCN || lunar.monthStr, 20)}${safeText(lunar.lunarDayCN || lunar.dayStr, 20)}`;
    } catch {
        return '';
    }
}

async function fetchNagerYear(year, countryCode, fetchImpl) {
    const key = `${year}:${countryCode}`;
    const cached = nagerCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < NAGER_CACHE_TTL_MS) return cached.value;
    const response = await fetchImpl(`https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(countryCode)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Nager.Date 返回 HTTP ${response.status}`);
    const value = await response.json();
    if (!Array.isArray(value)) throw new Error('Nager.Date 返回结构无效');
    nagerCache.set(key, { fetchedAt: Date.now(), value });
    return value;
}

async function chinaCalendar(dateString, chineseDays) {
    if (!chineseDays?.getDayDetail || !chineseDays?.getLunarDate) throw new Error('chinese-days 未加载');
    const date = parseLocalDate(dateString);
    const detail = chineseDays.getDayDetail(dateString) || {};
    const names = holidayNames(detail);
    const isWorkday = Boolean(chineseDays.isWorkday?.(dateString));
    const isHoliday = Boolean(chineseDays.isHoliday?.(dateString));
    const adjustedWorkday = isWorkday && Boolean(names.localName);
    const namedHoliday = isHoliday && Boolean(names.localName);
    const dayType = adjustedWorkday ? '调休工作日' : namedHoliday ? '节假日' : isWorkday ? '工作日' : '周末';
    let nextHoliday = null;
    for (let offset = 1; offset <= 90; offset += 1) {
        const candidate = addDays(dateString, offset);
        const candidateDetail = chineseDays.getDayDetail(candidate) || {};
        const candidateNames = holidayNames(candidateDetail);
        if (chineseDays.isHoliday?.(candidate) && candidateNames.localName) {
            nextHoliday = { date: candidate, name: candidateNames.localName, daysUntil: offset };
            break;
        }
    }
    return {
        date: dateString,
        countryCode: 'CN',
        weekDayName: WEEKDAYS_ZH[date.getDay()],
        dayType,
        isHoliday,
        isWorkday,
        isAdjustedWorkday: adjustedWorkday,
        holidayName: namedHoliday ? names.localName : '',
        lunarDate: lunarText(chineseDays, dateString),
        nextHoliday,
        source: 'chinese-days',
    };
}

async function internationalCalendar(dateString, countryCode, fetchImpl) {
    const date = parseLocalDate(dateString);
    const year = date.getFullYear();
    const current = await fetchNagerYear(year, countryCode, fetchImpl);
    const following = await fetchNagerYear(year + 1, countryCode, fetchImpl).catch(() => []);
    const holidays = [...current, ...following]
        .map(item => ({ date: safeText(item?.date, 10), name: safeText(item?.localName || item?.name, 120) }))
        .filter(item => item.date && item.name)
        .sort((a, b) => a.date.localeCompare(b.date));
    const today = holidays.find(item => item.date === dateString);
    const next = holidays.find(item => item.date > dateString);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    return {
        date: dateString,
        countryCode,
        weekDayName: WEEKDAYS_ZH[date.getDay()],
        dayType: today ? '节假日' : weekend ? '周末' : '工作日',
        isHoliday: Boolean(today),
        isWorkday: !today && !weekend,
        isAdjustedWorkday: false,
        holidayName: today?.name || '',
        lunarDate: '',
        nextHoliday: next ? { ...next, daysUntil: dayDifference(dateString, next.date) } : null,
        source: 'Nager.Date',
    };
}

export async function getCalendarContext(dateString, countryCode = 'CN', dependencies = {}) {
    const normalizedDate = formatLocalDate(parseLocalDate(dateString) || new Date());
    const normalizedCountry = /^[A-Z]{2}$/.test(String(countryCode || '').toUpperCase()) ? String(countryCode).toUpperCase() : 'CN';
    if (normalizedCountry === 'CN') {
        return chinaCalendar(normalizedDate, dependencies.chineseDays || globalThis.chineseDays);
    }
    const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('当前浏览器没有 fetch');
    return internationalCalendar(normalizedDate, normalizedCountry, fetchImpl);
}
