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
    cycleEnabled: false,
    userCycleStartDate: '', userCycleLength: 28, userPeriodDuration: 5,
    charCycleStartDate: '', charCycleLength: 28, charPeriodDuration: 5,
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
    value.userCycleStartDate = normalizeFullDate(value.userCycleStartDate || (value.cycleOwner === '{{user}}' ? value.cycleStartDate : ''));
    value.charCycleStartDate = normalizeFullDate(value.charCycleStartDate || (value.cycleOwner === '{{char}}' ? value.cycleStartDate : ''));
    value.pregnancyStartDate = normalizeFullDate(value.pregnancyStartDate);
    value.pregnancyOwner = sanitizeMacroLabel(value.pregnancyOwner, '{{user}}');
    value.macroName = normalizeMacroName(value.macroName);
    value.boundCharacterIds = [...new Set((Array.isArray(value.boundCharacterIds) ? value.boundCharacterIds : []).map(item => sanitizeInline(item, 120)).filter(Boolean))].slice(0, 200);
    value.anniversaries = (Array.isArray(value.anniversaries) ? value.anniversaries : []).map((event, index) => ({
        id: sanitizeInline(event?.id || `event-${index}`, 80), name: sanitizeInline(event?.name, 80),
        date: normalizeDateInput(event?.date), type: event?.type === 'birthday' ? 'birthday' : 'anniversary',
    })).filter(event => event.name && event.date).slice(0, 100);
    value.weatherRefreshMinutes = clampInteger(value.weatherRefreshMinutes, 5, 180, 30);
    value.locationRefreshMinutes = clampInteger(value.locationRefreshMinutes, 5, 60, 10);
    value.userCycleLength = clampInteger(input.userCycleLength ?? input.cycleLength ?? value.userCycleLength, 15, 60, 28);
    value.userPeriodDuration = clampInteger(input.userPeriodDuration ?? input.periodDuration ?? value.userPeriodDuration, 1, Math.min(14, value.userCycleLength), 5);
    value.charCycleLength = clampInteger(input.charCycleLength ?? input.cycleLength ?? value.charCycleLength, 15, 60, 28);
    value.charPeriodDuration = clampInteger(input.charPeriodDuration ?? input.periodDuration ?? value.charPeriodDuration, 1, Math.min(14, value.charCycleLength), 5);
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
export function characterKeys(character, index = null) {
    if (!character || typeof character !== 'object') return [];
    return [...new Set([
        character.avatar,
        character.id,
        character.uid,
        character.uuid,
        character.characterId,
        character.character_id,
        character.name,
        character.char_name,
        character.data?.avatar,
        character.data?.name,
        index,
    ].filter(value => value !== null && value !== undefined && String(value).trim()).map(String))];
}

export function listCharacterBindings(context) {
    const characters = Array.isArray(context?.characters) ? context.characters : [];
    return characters.map((character, index) => {
        const keys = characterKeys(character, index);
        return {
            id: String(character?.avatar || character?.data?.avatar || character?.id || character?.uuid || index),
            legacyId: String(index),
            name: String(character?.name || character?.data?.name || character?.char_name || `角色 ${index}`),
            keys,
            character,
        };
    });
}

export function resolveCurrentCharacter(context) {
    if (context?.groupId !== null && context?.groupId !== undefined && String(context.groupId).trim()) {
        return { character: null, index: null, keys: [], name: '' };
    }
    const characters = listCharacterBindings(context);
    const references = [
        context?.characterId,
        context?.currentCharacterId,
        context?.activeCharacterId,
        context?.active_character,
    ].filter(value => value !== null && value !== undefined && String(value).trim());
    const directCharacter = references.find(value => typeof value === 'object');
    if (directCharacter) {
        const index = characters.findIndex(item => item.character === directCharacter);
        return {
            character: directCharacter,
            index: index >= 0 ? index : null,
            keys: characterKeys(directCharacter, index >= 0 ? index : null),
            name: String(directCharacter?.name || directCharacter?.data?.name || directCharacter?.char_name || ''),
        };
    }
    for (const reference of references.map(String)) {
        if (/^\d+$/.test(reference) && characters[Number(reference)]) {
            const item = characters[Number(reference)];
            return { character: item.character, index: Number(reference), keys: item.keys, name: item.name };
        }
        const item = characters.find(candidate => candidate.keys.includes(reference));
        if (item) return { character: item.character, index: Number(item.legacyId), keys: item.keys, name: item.name };
    }
    const systemNames = new Set(['SillyTavern System', 'TauriTavern System']);
    const fallbackName = systemNames.has(String(context?.name2 || '')) ? '' : String(context?.name2 || '');
    const fallbackKeys = [...new Set([
        ...references.map(value => typeof value === 'object' ? '' : String(value)),
        fallbackName,
    ].filter(value => String(value || '').trim()).map(String))];
    return { character: null, index: null, keys: fallbackKeys, name: fallbackName };
}

export function matchesCharacterBinding(boundCharacterIds, characterKeys) {
    const ids = Array.isArray(boundCharacterIds) ? boundCharacterIds.map(String).filter(Boolean) : [];
    if (ids.length === 0) return true;
    const keys = (Array.isArray(characterKeys) ? characterKeys : [characterKeys])
        .filter(value => value !== null && value !== undefined && String(value).trim())
        .map(String);
    return keys.some(key => ids.includes(key));
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
    const environmentLines = ['【现实环境信息】'];
    const anniversaryLines = [];
    const wellbeingLines = [];
    const timeZone = sanitizeInline(clientTimeZone || status?.time?.timeZone || '', 80);
    if (settings.injectTime) environmentLines.push('当前时间：{{date}} {{time}}');
    if (settings.injectTimezone && timeZone) environmentLines.push(`时区：${timeZone}`);
    if (settings.injectWeekday) environmentLines.push('星期：{{weekday}}');
    appendCalendarLines(environmentLines, settings, status?.calendar);
    appendAnniversaryLines(anniversaryLines, settings, status?.anniversaries || collectAnniversaries(settings, status?.date || ''));
    if (settings.injectWeather) appendWeatherLines(environmentLines, settings, status?.weather, status?.location);
    appendWellbeingLines(wellbeingLines, settings, status);
    if (settings.injectBattery) appendBatteryLines(environmentLines, settings, status?.battery);
    if (settings.injectDevice) appendDeviceLines(environmentLines, settings, status?.device);
    const lines = [...environmentLines];
    if (anniversaryLines.length) lines.push('', '【生日和纪念日】', ...anniversaryLines);
    if (wellbeingLines.length) lines.push('', '【角色生理状态】', ...wellbeingLines);
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
        const todayExtra = Number.isInteger(event.years) ? (event.type === 'birthday' ? `（${event.years}岁）` : `（第${event.years}年）`) : '';
        const nextExtra = Number.isInteger(event.years) ? (event.type === 'birthday' ? `，届时${event.years}岁` : `，届时第${event.years}年`) : '';
        const prefix = event.type === 'birthday' ? '生日' : '纪念日';
        if (event.isToday) lines.push(`${prefix}：今天是${sanitizeInline(event.name, 80)}${todayExtra}！`);
        else lines.push(`${prefix}：${sanitizeInline(event.name, 80)}，日期${sanitizeInline(event.date, 10)}，下次${sanitizeInline(event.nextDate, 10)}（还有${Number(event.daysUntil)}天${nextExtra}）`);
    }
}
function appendWellbeingLines(lines, settings, status) {
    const pregnantOwner = settings.pregnancyEnabled && status?.pregnancy ? settings.pregnancyOwner : '';
    if (settings.cycleEnabled && Array.isArray(status?.cycles)) {
        for (const entry of status.cycles) {
            if (entry.owner === pregnantOwner) continue;
            const cycle = entry.status;
            lines.push(`- ${entry.owner}：${cycle.description}`);
            lines.push(`  最近一次经期：${cycle.recentStartDate} 至 ${cycle.recentEndDate}`);
            lines.push(`  下次预计月经来潮：${cycle.nextStartDate}（还有${cycle.daysToNext}天）`);
            lines.push(`  下次预计月经结束：${cycle.nextEndDate}`);
        }
    }
    if (settings.pregnancyEnabled && status?.pregnancy) {
        const p = status.pregnancy;
        lines.push(`- ${settings.pregnancyOwner}：孕${p.week}周（第${p.trimester}孕期），${p.statusText}，预产期${p.dueDate}`);
    }
    if ((settings.cycleEnabled && status?.cycles?.length) || (settings.pregnancyEnabled && status?.pregnancy)) {
        lines.push('（生理状态应自然影响精力、情绪、行动偏好与风险承受，不需要生硬医学播报）');
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
