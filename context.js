export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    injectTime: true,
    injectTimezone: true,
    injectWeekday: true,
    injectWeather: true,
    showLocation: true,
    showCondition: true,
    showTemperature: true,
    showFeelsLike: true,
    showHumidity: true,
    showWind: true,
    weatherProvider: 'open-meteo',
    locationMode: 'manual',
    reverseGeocodingProvider: 'auto',
    manualLocation: '武汉',
    weatherRefreshMinutes: 30,
    locationRefreshMinutes: 10,
    injectBattery: true,
    showCharging: true,
    injectDevice: true,
    showDeviceName: true,
    showDeviceModel: true,
    showDevicePlatform: true,
    customDeviceName: '',
    injectionMode: 'in_chat',
    injectionDepth: 1,
    authorNoteDepth: 4,
});

export function normalizeSettings(input = {}) {
    const value = { ...DEFAULT_SETTINGS, ...input };
    value.weatherProvider = ['open-meteo', 'met-norway', 'wttr.in'].includes(value.weatherProvider)
        ? value.weatherProvider
        : DEFAULT_SETTINGS.weatherProvider;
    value.locationMode = value.locationMode === 'auto' ? 'auto' : 'manual';
    value.reverseGeocodingProvider = ['auto', 'nominatim', 'bigdatacloud', 'photon'].includes(value.reverseGeocodingProvider)
        ? value.reverseGeocodingProvider
        : DEFAULT_SETTINGS.reverseGeocodingProvider;
    value.injectionMode = ['system', 'in_chat', 'authors_note'].includes(value.injectionMode)
        ? value.injectionMode
        : DEFAULT_SETTINGS.injectionMode;
    value.manualLocation = sanitizeInline(value.manualLocation, 160);
    value.customDeviceName = sanitizeInline(value.customDeviceName, 80);
    value.weatherRefreshMinutes = clampInteger(value.weatherRefreshMinutes, 5, 180, 30);
    value.locationRefreshMinutes = clampInteger(value.locationRefreshMinutes, 5, 60, 10);
    value.injectionDepth = clampInteger(value.injectionDepth, 0, 100, 1);
    value.authorNoteDepth = clampInteger(value.authorNoteDepth, 0, 100, 4);

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (typeof DEFAULT_SETTINGS[key] === 'boolean') {
            value[key] = Boolean(value[key]);
        }
    }

    return value;
}

export function clampInteger(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return fallback;
    }
    return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function sanitizeInline(value, maxLength = 120) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

export function markStatusStale(status) {
    if (!status || typeof status !== 'object') {
        return null;
    }
    const copy = JSON.parse(JSON.stringify(status));
    if (copy.battery) copy.battery.stale = true;
    if (copy.location) copy.location.stale = true;
    if (copy.weather) copy.weather.stale = true;
    copy.meta = { ...(copy.meta || {}), uiCache: true };
    return copy;
}

export function buildEnvironmentPrompt(settingsInput, status, clientTimeZone = '') {
    const settings = normalizeSettings(settingsInput);
    if (!settings.enabled) {
        return '';
    }

    const lines = ['【现实环境信息】'];
    const timeZone = sanitizeInline(clientTimeZone || status?.time?.timeZone || '', 80);

    if (settings.injectTime) {
        lines.push('当前时间：{{date}} {{time}}');
    }
    if (settings.injectTimezone && timeZone) {
        lines.push(`时区：${timeZone}`);
    }
    if (settings.injectWeekday) {
        lines.push('星期：{{weekday}}');
    }

    if (settings.injectWeather) {
        appendWeatherLines(lines, settings, status?.weather, status?.location);
    }

    if (settings.injectBattery) {
        appendBatteryLines(lines, settings, status?.battery);
    }

    if (settings.injectDevice) {
        appendDeviceLines(lines, settings, status?.device);
    }

    const staleParts = [];
    if (settings.injectBattery && status?.battery?.stale) {
        staleParts.push(formatStalePart('电量', status.battery));
    }
    if (settings.injectWeather && status?.location?.stale) {
        staleParts.push(formatStalePart('定位', status.location));
    }
    if (settings.injectWeather && status?.weather?.stale) {
        staleParts.push(formatStalePart('天气', status.weather));
    }
    if (staleParts.length > 0) {
        lines.push(`数据状态：${staleParts.join('；')}`);
    }

    return lines.join('\n');
}

function formatStalePart(label, value) {
    const fetchedAt = String(value?.fetchedAt || '').trim();
    if (!fetchedAt) return `${label}使用旧缓存`;
    const displayTime = fetchedAt.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
    return `${label}使用旧缓存（采集于 ${displayTime}）`;
}

function appendWeatherLines(lines, settings, weather, location) {
    if (settings.showLocation) {
        const locationLabel = sanitizeInline(location?.label || weather?.location || '', 160);
        lines.push(`地点：${locationLabel || '暂不可用'}`);
    }

    if (!weather) {
        if (settings.showCondition) lines.push('天气：暂不可用');
        return;
    }

    if (settings.showCondition) {
        lines.push(`天气：${sanitizeInline(weather.condition || '暂不可用', 80)}`);
    }
    if (settings.showTemperature && hasFiniteNumber(weather.temperature)) {
        let temperature = `温度：${formatNumber(weather.temperature)}°C`;
        if (settings.showFeelsLike && hasFiniteNumber(weather.feelsLike)) {
            temperature += `（体感：${formatNumber(weather.feelsLike)}°C）`;
        }
        lines.push(temperature);
    }
    if (settings.showHumidity && hasFiniteNumber(weather.humidity)) {
        lines.push(`湿度：${formatNumber(weather.humidity)}%`);
    }
    if (settings.showWind && hasFiniteNumber(weather.windSpeed)) {
        const direction = sanitizeInline(weather.windDirection || '', 24);
        lines.push(`风速：${formatNumber(weather.windSpeed)} km/h${direction ? ` ${direction}` : ''}`);
    }
}

function appendBatteryLines(lines, settings, battery) {
    if (!battery || !hasFiniteNumber(battery.percentage)) {
        lines.push('电量：暂不可用');
        return;
    }

    lines.push(`电量：${Math.round(Number(battery.percentage))}%`);
    if (settings.showCharging) {
        lines.push(`充电状态：${battery.charging ? '充电中' : '未充电'}`);
    }
}

function appendDeviceLines(lines, settings, device) {
    const platform = sanitizeInline(device?.platform || '未知平台', 40);
    const model = sanitizeInline(device?.model || '浏览器未提供', 80);
    const configuredName = sanitizeInline(settings.customDeviceName, 80);
    const detectedName = sanitizeInline(device?.name || '', 80);
    const displayName = configuredName || detectedName || (platform !== '未知平台' ? `${platform} 设备` : '浏览器未提供');

    lines.push('设备信息：');
    if (settings.showDeviceName) lines.push(`设备名称：${displayName}`);
    if (settings.showDeviceModel) lines.push(`设备型号：${model}`);
    if (settings.showDevicePlatform) lines.push(`平台：${platform}`);
}

function hasFiniteNumber(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function formatNumber(value) {
    const number = Number(value);
    if (Number.isInteger(number)) {
        return String(number);
    }
    return number.toFixed(1).replace(/\.0$/, '');
}
