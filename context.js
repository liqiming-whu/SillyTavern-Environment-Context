import { collectAnniversaries } from './wellbeing.js';

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    boundCharacterIds: [],
    injectTime: true, injectTimezone: true, injectWeekday: true,
    injectWeather: true, showLocation: true, showCondition: true, showTemperature: true,
    showFeelsLike: true, showHumidity: true, showWind: true,
    weatherProvider: 'open-meteo', locationMode: 'manual', reverseGeocodingProvider: 'auto',
    manualLocation: '武汉', weatherRefreshMinutes: 30, locationRefreshMinutes: 10,
    calendarEnabled: true, countryCode: 'CN',
    anniversariesEnabled: true, userBirthday: '', charBirthday: '', anniversaries: [],
    cycleEnabled: false, cycleOwner: '{{user}}', cycleStartDate: '', cycleLength: 28, periodDuration: 5,
    pregnancyEnabled: false, pregnancyOwner: '{{user}}', pregnancyStartDate: '',
    injectBattery: true, showCharging: true,
    injectDevice: true, showDeviceName: true, showDeviceModel: true, showDevicePlatform: true, customDeviceName: '',
    injectionMode: 'in_chat', injectionDepth: 1, authorNoteDepth: 4, macroName: 'environment_context',
});

export function normalizeSettings(input = {}) {
    const value = { ...DEFAULT_SETTINGS, ...input };
    value.weatherProvider = ['auto', 'open-meteo', 'met-norway', 'wttr.in'].includes(value.weatherProvider) ? value.weatherProvider : DEFAULT_SETTINGS.weatherProvider;
    value.locationMode = value.locationMode === 'auto' ? 'auto' : 'manual';
    value.reverseGeocodingProvider = ['auto', 'nominatim', 'bigdatacloud', 'photon'].includes(value.reverseGeocodingProvider) ? value.reverseGeocodingProvider : DEFAULT_SETTINGS.reverseGeocodingProvider;
    value.injectionMode = ['system', 'in_chat', 'authors_note', 'macro'].includes(value.injectionMode) ? value.injectionMode : DEFAULT_SETTINGS.injectionMode;
    value.manualLocation = sanitizeInline(value.manualLocation, 160);
    value.customDeviceName = sanitizeInline(value.customDeviceName, 80);
    value.countryCode = /^[A-Z]{2}$/.test(String(value.countryCode || '').toUpperCase()) ? String(value.countryCode).toUpperCase() : 'CN';
    value.userBirthday = normalizeDateInput(value.userBirthday);
    value.charBirthday = normalizeDateInput(value.charBirthday);
    value.cycleStartDate = normalizeFullDate(value.cycleStartDate);
    value.pregnancyStartDate = normalizeFullDate(value.pregnancyStartDate);
    value.cycleOwner = sanitizeMacroLabel(value.cycleOwner, '{{user}}');
    value.pregnancyOwner = sanitizeMacroLabel(value.pregnancyOwner, '{{user}}');
    value.macroName = normalizeMacroName(value.macroName);
    value.boundCharacterIds = [...new Set((Array.isArray(value.boundCharacterIds) ? value.boundCharacterIds : []).map(item => sanitizeInline(item, 120)).filter(Boolean))].slice(0, 200);
    value.anniversaries = (Array.isArray(value.anniversaries) ? value.anniversaries : []).map((event, index) => ({
        id: sanitizeInline(event?.id || `event-${index}`, 80), name: sanitizeInline(event?.name, 80),
        date: normalizeDateInput(event?.date), type: event?.type === 'birthday' ? 'birthday' : 'anniversary',
    })).filter(event => event.name && event.date).slice(0, 100);
    value.weatherRefreshMinutes = clampInteger(value.weatherRefreshMinutes, 5, 180, 30);
    value.locationRefreshMinutes = clampInteger(value.locationRefreshMinutes, 5, 60, 10);
    value.cycleLength = clampInteger(value.cycleLength, 15, 60, 28);
    value.periodDuration = clampInteger(value.periodDuration, 1, Math.min(14, value.cycleLength), 5);
    value.injectionDepth = clampInteger(value.injectionDepth, 0, 100, 1);
    value.authorNoteDepth = clampInteger(value.authorNoteDepth, 0, 100, 4);
    for (const key of Object.keys(DEFAULT_SETTINGS)) if (typeof DEFAULT_SETTINGS[key] === 'boolean') value[key] = Boolean(value[key]);
    return value;
}

export function clampInteger(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
}
export function sanitizeInline(value, maxLength = 120) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
function sanitizeMacroLabel(value, fallback) {
    const text = String(value || fallback).trim();
    return ['{{user}}', '{{char}}'].includes(text) ? text : sanitizeInline(text, 80) || fallback;
}
export function normalizeMacroName(value) {
    return String(value || 'environment_context').trim().replace(/[{}\s]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'environment_context';
}
export function matchesCharacterBinding(boundCharacterIds, characterId) {
    const ids = Array.isArray(boundCharacterIds) ? boundCharacterIds.map(String).filter(Boolean) : [];
    return ids.length === 0 || (characterId !== null && characterId !== undefined && ids.includes(String(characterId)));
}
function normalizeFullDate(value) { const text = String(value || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''; }
function normalizeDateInput(value) { const text = String(value || '').trim(); return /^(?:\d{4}-)?\d{2}-\d{2}$/.test(text) ? text : ''; }

export function markStatusStale(status) {
    if (!status || typeof status !== 'object') return null;
    const copy = JSON.parse(JSON.stringify(status));
    if (copy.battery) copy.battery.stale = true;
    if (copy.location) copy.location.stale = true;
    if (copy.weather) copy.weather.stale = true;
    copy.meta = { ...(copy.meta || {}), uiCache: true };
    return copy;
}

export function buildEnvironmentPrompt(settingsInput, status, clientTimeZone = '') {
    const settings = normalizeSettings(settingsInput);
    if (!settings.enabled) return '';
    const lines = ['【现实环境信息】'];
    const timeZone = sanitizeInline(clientTimeZone || status?.time?.timeZone || '', 80);
    if (settings.injectTime) lines.push('当前时间：{{date}} {{time}}');
    if (settings.injectTimezone && timeZone) lines.push(`时区：${timeZone}`);
    if (settings.injectWeekday) lines.push('星期：{{weekday}}');
    appendCalendarLines(lines, settings, status?.calendar);
    appendAnniversaryLines(lines, settings, status?.anniversaries || collectAnniversaries(settings, status?.date || ''));
    if (settings.injectWeather) appendWeatherLines(lines, settings, status?.weather, status?.location);
    appendWellbeingLines(lines, settings, status);
    if (settings.injectBattery) appendBatteryLines(lines, settings, status?.battery);
    if (settings.injectDevice) appendDeviceLines(lines, settings, status?.device);
    const staleParts = [];
    if (settings.injectBattery && status?.battery?.stale) staleParts.push(formatStalePart('电量', status.battery));
    if (settings.injectWeather && status?.location?.stale) staleParts.push(formatStalePart('定位', status.location));
    if (settings.injectWeather && status?.weather?.stale) staleParts.push(formatStalePart('天气', status.weather));
    if (staleParts.length) lines.push(`数据状态：${staleParts.join('；')}`);
    return lines.join('\n');
}

function appendCalendarLines(lines, settings, calendar) {
    if (!settings.calendarEnabled || !calendar) return;
    lines.push(`日历：星期${sanitizeInline(calendar.weekDayName, 8)}｜${sanitizeInline(calendar.dayType, 20)}`);
    if (calendar.holidayName) lines.push(`今日节假日：${sanitizeInline(calendar.holidayName, 80)}`);
    if (calendar.lunarDate) lines.push(`农历：${sanitizeInline(calendar.lunarDate, 40)}`);
    if (calendar.nextHoliday) lines.push(`下一个节假日：${sanitizeInline(calendar.nextHoliday.name, 80)}（${sanitizeInline(calendar.nextHoliday.date, 10)}，还有${Number(calendar.nextHoliday.daysUntil)}天）`);
}
function appendAnniversaryLines(lines, settings, anniversaries) {
    if (!settings.anniversariesEnabled || !Array.isArray(anniversaries)) return;
    for (const event of anniversaries) {
        const extra = Number.isInteger(event.years) ? (event.type === 'birthday' ? `（${event.years}岁）` : `（第${event.years}年）`) : '';
        lines.push(`${event.type === 'birthday' ? '生日' : '纪念日'}：今天是${sanitizeInline(event.name, 80)}${extra}！`);
    }
}
function appendWellbeingLines(lines, settings, status) {
    if (settings.cycleEnabled && status?.cycle && !status?.pregnancy) {
        lines.push('角色生理状态：', `- ${settings.cycleOwner}：${status.cycle.description}`, '（生理状态应自然地影响精力、情绪和行为，但不必每次都明确提及）');
    }
    if (settings.pregnancyEnabled && status?.pregnancy) {
        const p = status.pregnancy;
        lines.push('孕期追踪：', `- ${settings.pregnancyOwner}：孕${p.week}周（第${p.trimester}孕期），${p.statusText}，预产期${p.dueDate}`, '（孕期状态应自然影响体力、情绪、行动偏好与风险承受，不需要生硬医学播报）');
    }
}
function formatStalePart(label, value) {
    const fetchedAt = String(value?.fetchedAt || '').trim();
    return fetchedAt ? `${label}使用旧缓存（采集于 ${fetchedAt.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')}）` : `${label}使用旧缓存`;
}
function appendWeatherLines(lines, settings, weather, location) {
    if (settings.showLocation) lines.push(`地点：${sanitizeInline(location?.label || weather?.location || '', 160) || '暂不可用'}`);
    if (!weather) { if (settings.showCondition) lines.push('天气：暂不可用'); return; }
    if (settings.showCondition) lines.push(`天气：${sanitizeInline(weather.condition || '暂不可用', 80)}`);
    if (settings.showTemperature && hasFiniteNumber(weather.temperature)) {
        let text = `温度：${formatNumber(weather.temperature)}°C`;
        if (settings.showFeelsLike && hasFiniteNumber(weather.feelsLike)) text += `（体感：${formatNumber(weather.feelsLike)}°C）`;
        lines.push(text);
    }
    if (settings.showHumidity && hasFiniteNumber(weather.humidity)) lines.push(`湿度：${formatNumber(weather.humidity)}%`);
    if (settings.showWind && hasFiniteNumber(weather.windSpeed)) lines.push(`风速：${formatNumber(weather.windSpeed)} km/h${weather.windDirection ? ` ${sanitizeInline(weather.windDirection, 24)}` : ''}`);
    if (weather.fallbackErrors?.length) lines.push(`天气容错：${weather.fallbackErrors.join('；')}；已使用 ${sanitizeInline(weather.source, 40)}`);
}
function appendBatteryLines(lines, settings, battery) {
    if (!battery || !hasFiniteNumber(battery.percentage)) return lines.push('电量：暂不可用');
    lines.push(`电量：${Math.round(Number(battery.percentage))}%`);
    if (settings.showCharging) lines.push(`充电状态：${battery.charging ? '充电中' : '未充电'}`);
}
function appendDeviceLines(lines, settings, device) {
    const platform = sanitizeInline(device?.platform || '未知平台', 40);
    const model = sanitizeInline(device?.model || '浏览器未提供', 80);
    const name = sanitizeInline(settings.customDeviceName, 80) || sanitizeInline(device?.name || '', 80) || (platform !== '未知平台' ? `${platform} 设备` : '浏览器未提供');
    lines.push('设备信息：');
    if (settings.showDeviceName) lines.push(`设备名称：${name}`);
    if (settings.showDeviceModel) lines.push(`设备型号：${model}`);
    if (settings.showDevicePlatform) lines.push(`平台：${platform}`);
}
function hasFiniteNumber(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }
function formatNumber(value) { const number = Number(value); return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, ''); }
