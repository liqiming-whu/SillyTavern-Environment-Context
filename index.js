import {
    eventSource,
    event_types,
    extension_prompt_roles,
    extension_prompt_types,
    saveSettingsDebounced,
    setExtensionPrompt,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import {
    DEFAULT_SETTINGS,
    buildEnvironmentPrompt,
    markStatusStale,
    normalizeSettings,
} from './context.js';
import { readBrowserDevice } from './device.js';
import { createStatusService } from './weather.js';

const SETTINGS_KEY = 'environmentContext';
const PROMPT_KEY = 'environment_context_ephemeral';
const getWeatherStatus = createStatusService();

let lastStatus = null;
let lastStatusIdentity = '';
let requestSequence = 0;

function loadSettings() {
    const normalized = normalizeSettings(extension_settings[SETTINGS_KEY] || DEFAULT_SETTINGS);
    extension_settings[SETTINGS_KEY] = normalized;
    return normalized;
}

function currentSettings() {
    return normalizeSettings(extension_settings[SETTINGS_KEY]);
}

function saveSetting(key, value) {
    extension_settings[SETTINGS_KEY] = normalizeSettings({
        ...extension_settings[SETTINGS_KEY],
        [key]: value,
    });
    saveSettingsDebounced();
}

function clientTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (error) {
        console.error('[环境上下文] 读取浏览器时区失败', error);
        return '';
    }
}

function weatherIdentity(settings) {
    if (!settings.injectWeather) return 'weather-disabled';
    const location = settings.locationMode === 'manual' ? settings.manualLocation.trim().toLocaleLowerCase() : 'browser';
    return `${settings.weatherProvider}|${settings.locationMode}|${location}`;
}

function compatibleLastStatus(settings) {
    if (!lastStatus) return null;
    if (!settings.injectWeather) {
        return { ...lastStatus, location: null, weather: null };
    }
    if (lastStatusIdentity === weatherIdentity(settings)) {
        return lastStatus;
    }
    return { ...lastStatus, location: null, weather: null, errors: {} };
}

let browserLocationCache = null;

async function readBrowserBattery() {
    if (typeof navigator.getBattery !== 'function') {
        throw new Error('当前浏览器不支持 Battery Status API');
    }
    const manager = await navigator.getBattery();
    const level = Number(manager.level);
    if (!Number.isFinite(level) || level < 0 || level > 1) {
        throw new Error('浏览器返回的电量无效');
    }
    return {
        percentage: Math.round(level * 100),
        charging: Boolean(manager.charging),
        source: 'browser-battery',
        stale: false,
        cached: false,
        fetchedAt: new Date().toISOString(),
        ageSeconds: 0,
    };
}

function getBrowserPosition(options) {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('当前浏览器不支持设备定位'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, error => {
            const messages = {
                1: '浏览器定位权限被拒绝',
                2: '浏览器暂时无法获取位置',
                3: '浏览器定位超时',
            };
            reject(new Error(messages[error.code] || error.message || '浏览器定位失败'));
        }, options);
    });
}

async function readBrowserLocation(settings, forceRefresh) {
    const ttlMs = settings.locationRefreshMinutes * 60_000;
    const now = Date.now();
    if (!forceRefresh && browserLocationCache && now - browserLocationCache.fetchedAtMs < ttlMs) {
        return {
            ...browserLocationCache.value,
            cached: true,
            stale: false,
            ageSeconds: Math.max(0, Math.round((now - browserLocationCache.fetchedAtMs) / 1000)),
        };
    }

    try {
        const position = await getBrowserPosition({
            enableHighAccuracy: false,
            timeout: 8_000,
            maximumAge: forceRefresh ? 0 : ttlMs,
        });
        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new Error('浏览器定位坐标无效');
        }
        const fetchedAtMs = Number(position.timestamp) > 0 ? Number(position.timestamp) : Date.now();
        const value = {
            latitude,
            longitude,
            accuracy: Number.isFinite(Number(position.coords.accuracy)) ? Number(position.coords.accuracy) : null,
            provider: 'browser-geolocation',
            locationTimestamp: fetchedAtMs,
            fetchedAt: new Date(fetchedAtMs).toISOString(),
            ageSeconds: Math.max(0, Math.round((Date.now() - fetchedAtMs) / 1000)),
            stale: false,
            cached: false,
        };
        browserLocationCache = { value, fetchedAtMs };
        return value;
    } catch (error) {
        if (browserLocationCache) {
            return {
                ...browserLocationCache.value,
                cached: true,
                stale: true,
                ageSeconds: Math.max(0, Math.round((Date.now() - browserLocationCache.fetchedAtMs) / 1000)),
                refreshError: String(error?.message || error),
            };
        }
        throw error;
    }
}

function buildWeatherQuery(settings, browserLocation, forceRefresh = false) {
    const query = {
        force: forceRefresh ? '1' : '0',
        weather: '1',
        provider: settings.weatherProvider,
        locationMode: settings.locationMode,
        locationRefreshMinutes: String(settings.locationRefreshMinutes),
        weatherRefreshMinutes: String(settings.weatherRefreshMinutes),
    };
    if (settings.locationMode === 'manual') {
        query.location = settings.manualLocation;
    } else {
        query.latitude = String(browserLocation.latitude);
        query.longitude = String(browserLocation.longitude);
        if (browserLocation.accuracy !== null) query.accuracy = String(browserLocation.accuracy);
        query.locationTimestamp = String(browserLocation.locationTimestamp);
    }
    return query;
}

async function fetchWeatherStatus(settings, browserLocation, forceRefresh) {
    const payload = await getWeatherStatus(buildWeatherQuery(settings, browserLocation, forceRefresh));
    if (!payload || typeof payload !== 'object' || typeof payload.ok !== 'boolean') {
        throw new Error('天气模块返回结构无效');
    }
    return payload;
}

async function fetchEnvironmentStatus(settings, forceRefresh = false) {
    const result = {
        ok: true,
        time: { iso: new Date().toISOString(), timeZone: clientTimeZone() },
        battery: null,
        device: null,
        location: null,
        weather: null,
        errors: {},
        warnings: {},
        meta: { forceRefresh },
    };
    const tasks = [];

    if (settings.injectBattery) {
        tasks.push((async () => {
            try {
                result.battery = await readBrowserBattery();
            } catch (error) {
                result.errors.battery = String(error?.message || error);
            }
        })());
    }

    if (settings.injectDevice) {
        tasks.push((async () => {
            try {
                result.device = await readBrowserDevice(navigator);
            } catch (error) {
                result.errors.device = String(error?.message || error);
            }
        })());
    }

    if (settings.injectWeather) {
        tasks.push((async () => {
            let browserLocation = null;
            if (settings.locationMode === 'auto') {
                try {
                    browserLocation = await readBrowserLocation(settings, forceRefresh);
                    if (browserLocation.stale && browserLocation.refreshError) {
                        result.warnings.location = browserLocation.refreshError;
                    }
                } catch (error) {
                    result.errors.location = String(error?.message || error);
                    return;
                }
            }
            try {
                const server = await fetchWeatherStatus(settings, browserLocation, forceRefresh);
                result.time = server.time || result.time;
                result.location = server.location || browserLocation;
                result.weather = server.weather || null;
                Object.assign(result.errors, server.errors || {});
                Object.assign(result.warnings, server.warnings || {});
            } catch (error) {
                result.errors.weather = String(error?.message || error);
            }
        })());
    }

    await Promise.all(tasks);
    result.ok = Object.keys(result.errors).length === 0;
    return result;
}

function resolvePromptPlacement(settings) {
    if (settings.injectionMode === 'system') {
        return { position: extension_prompt_types.IN_PROMPT, depth: 0 };
    }
    if (settings.injectionMode === 'authors_note') {
        return { position: extension_prompt_types.IN_CHAT, depth: settings.authorNoteDepth };
    }
    return { position: extension_prompt_types.IN_CHAT, depth: settings.injectionDepth };
}

function applyPrompt(settings, status) {
    if (!settings.enabled) {
        clearPrompt();
        return '';
    }
    const prompt = buildEnvironmentPrompt(settings, status, clientTimeZone());
    const placement = resolvePromptPlacement(settings);
    setExtensionPrompt(
        PROMPT_KEY,
        prompt,
        placement.position,
        placement.depth,
        false,
        extension_prompt_roles.SYSTEM,
    );
    updatePreview(prompt, status);
    return prompt;
}

function clearPrompt() {
    setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.NONE, 0, false, extension_prompt_roles.SYSTEM);
    updatePreview('', null);
}

async function refreshEnvironment({ notify = false, forceRefresh = false } = {}) {
    const settings = currentSettings();
    const sequence = ++requestSequence;

    if (!settings.enabled) {
        clearPrompt();
        return;
    }

    setUiStatus(forceRefresh ? '正在绕过缓存并重新读取环境状态…' : '正在读取环境状态…', false);
    try {
        const status = await fetchEnvironmentStatus(settings, forceRefresh);
        if (sequence !== requestSequence) return;
        lastStatus = status;
        lastStatusIdentity = weatherIdentity(settings);
        const prompt = applyPrompt(settings, status);
        const errors = Object.values(status?.errors || {}).filter(Boolean);
        const warnings = Object.values(status?.warnings || {}).filter(Boolean);
        if (errors.length > 0) {
            setUiStatus(`部分信息不可用：${errors.join('；')}`, true);
            if (notify) toastr.warning(errors.join('\n'), '环境上下文部分读取失败');
        } else if (warnings.length > 0) {
            setUiStatus(`环境状态已更新，但有提示：${warnings.join('；')}`, true);
            if (notify) toastr.warning(warnings.join('\n'), '环境上下文已刷新');
        } else {
            setUiStatus('环境状态已更新', false);
            if (notify) toastr.success('时间、天气和电量上下文已刷新', '环境上下文');
        }
        return prompt;
    } catch (error) {
        if (sequence !== requestSequence) return;
        console.error('[环境上下文] 刷新失败', error);
        const staleStatus = markStatusStale(compatibleLastStatus(settings));
        const prompt = applyPrompt(settings, staleStatus);
        const message = error?.name === 'AbortError'
            ? '环境请求超时，已继续生成'
            : String(error?.message || error);
        setUiStatus(`${message}${staleStatus ? '；正在使用浏览器旧缓存' : ''}`, true);
        if (notify) toastr.error(message, '环境上下文刷新失败');
        return prompt;
    }
}

async function onGenerationAfterCommands(_type, _options, _dryRun) {
    await refreshEnvironment({ notify: false });
}

function formatCacheDetail(label, value) {
    if (!value?.fetchedAt) return '';
    const collectedAt = new Date(value.fetchedAt);
    const collectedText = Number.isNaN(collectedAt.getTime())
        ? String(value.fetchedAt)
        : collectedAt.toLocaleString('zh-CN', { hour12: false });
    const ageSeconds = Number.isFinite(Number(value.ageSeconds)) ? Number(value.ageSeconds) : 0;
    const ageText = ageSeconds >= 3600
        ? `${Math.floor(ageSeconds / 3600)}小时${Math.floor((ageSeconds % 3600) / 60)}分钟前`
        : ageSeconds >= 60
            ? `${Math.floor(ageSeconds / 60)}分钟前`
            : `${Math.max(0, Math.round(ageSeconds))}秒前`;
    const state = value.stale
        ? '旧缓存（刷新失败）'
        : value.cached ? '缓存' : '新读取';
    return `${label}：${state}，采集于 ${collectedText}（${ageText}）`;
}

function updatePreview(prompt, status) {
    const preview = document.getElementById('environment_context_preview');
    if (preview) {
        preview.textContent = prompt || '当前未注入任何内容';
    }
    const detail = document.getElementById('environment_context_cache_detail');
    if (detail) {
        detail.textContent = [
            formatCacheDetail('电量', status?.battery),
            formatCacheDetail('定位', status?.location),
            formatCacheDetail('天气', status?.weather),
        ].filter(Boolean).join('\n');
    }
}

function setUiStatus(message, isError) {
    const element = document.getElementById('environment_context_status');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('environment-context-error', Boolean(isError));
}

function checkbox(label, key, description = '') {
    return `
        <label class="checkbox_label environment-context-checkbox" for="environment_context_${key}">
            <input id="environment_context_${key}" type="checkbox" data-ec-setting="${key}" />
            <span>${label}</span>
        </label>
        ${description ? `<small class="environment-context-help">${description}</small>` : ''}`;
}

function buildSettingsHtml() {
    return `
    <div id="environment_context_settings" class="environment-context-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>环境上下文</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p class="environment-context-intro">生成前读取环境状态，并通过临时扩展提示词注入；不会写入聊天历史。时间和星期优先使用 SillyTavern 官方宏。</p>

                <section>
                    <h4>总开关</h4>
                    ${checkbox('启用环境上下文', 'enabled')}
                </section>

                <section>
                    <h4>时间</h4>
                    ${checkbox('注入本地时间', 'injectTime', '使用 {{date}} 与 {{time}} 官方宏。')}
                    ${checkbox('注入时区', 'injectTimezone')}
                    ${checkbox('注入星期', 'injectWeekday', '使用 {{weekday}} 官方宏。')}
                </section>

                <section>
                    <h4>天气与地点</h4>
                    ${checkbox('注入天气', 'injectWeather')}
                    <label for="environment_context_weatherProvider">天气提供方</label>
                    <select id="environment_context_weatherProvider" class="text_pole" data-ec-setting="weatherProvider">
                        <option value="open-meteo">Open-Meteo（免 API Key）</option>
                        <option value="met-norway">MET Norway（免 API Key）</option>
                        <option value="wttr.in">wttr.in（免 API Key）</option>
                    </select>
                    <label for="environment_context_locationMode">地点来源</label>
                    <select id="environment_context_locationMode" class="text_pole" data-ec-setting="locationMode">
                        <option value="manual">手动地点</option>
                        <option value="auto">浏览器设备定位</option>
                    </select>
                    <div id="environment_context_manual_location_block">
                        <label for="environment_context_manualLocation">地点</label>
                        <input id="environment_context_manualLocation" class="text_pole" type="text" maxlength="160" placeholder="例如：武汉；重名时填写宜昌市" data-ec-setting="manualLocation" />
                    </div>
                    <div class="environment-context-grid">
                        ${checkbox('显示地点', 'showLocation')}
                        ${checkbox('天气状况', 'showCondition')}
                        ${checkbox('温度', 'showTemperature')}
                        ${checkbox('体感温度', 'showFeelsLike')}
                        ${checkbox('湿度', 'showHumidity')}
                        ${checkbox('风速', 'showWind')}
                    </div>
                    <label for="environment_context_weatherRefreshMinutes">天气刷新间隔（分钟，5–180）</label>
                    <input id="environment_context_weatherRefreshMinutes" class="text_pole" type="number" min="5" max="180" step="1" data-ec-setting="weatherRefreshMinutes" />
                    <label for="environment_context_locationRefreshMinutes">定位刷新间隔（分钟，5–60）</label>
                    <input id="environment_context_locationRefreshMinutes" class="text_pole" type="number" min="5" max="60" step="1" data-ec-setting="locationRefreshMinutes" />
                    <small class="environment-context-help">自动定位使用浏览器 Geolocation API。首次使用请允许当前 SillyTavern 页面访问位置；坐标会发送给天气服务和反向地理编码服务。</small>
                </section>

                <section>
                    <h4>电量</h4>
                    ${checkbox('注入电量', 'injectBattery')}
                    ${checkbox('显示充电状态', 'showCharging')}
                    <small class="environment-context-help">电量直接读取浏览器 Battery Status API，每次生成都会读取当前值。浏览器接口不提供电池温度。</small>
                </section>

                <section>
                    <h4>设备信息</h4>
                    ${checkbox('注入设备信息', 'injectDevice')}
                    <label for="environment_context_customDeviceName">设备名称（可选）</label>
                    <input id="environment_context_customDeviceName" class="text_pole" type="text" maxlength="80" placeholder="例如：我的手机；留空则使用平台通用名称" data-ec-setting="customDeviceName" />
                    <div class="environment-context-grid">
                        ${checkbox('显示设备名称', 'showDeviceName')}
                        ${checkbox('显示设备型号', 'showDeviceModel')}
                        ${checkbox('显示平台', 'showDevicePlatform')}
                    </div>
                    <small class="environment-context-help">平台优先读取 User-Agent Client Hints；型号仅在浏览器愿意提供时显示。浏览器没有读取系统自定义设备名称的通用 API，因此设备名称支持手动填写。</small>
                </section>

                <section>
                    <h4>注入位置</h4>
                    <label for="environment_context_injectionMode">方式</label>
                    <select id="environment_context_injectionMode" class="text_pole" data-ec-setting="injectionMode">
                        <option value="system">系统提示词区域</option>
                        <option value="in_chat">聊天内临时系统消息（推荐）</option>
                        <option value="authors_note">作者注释风格</option>
                    </select>
                    <div id="environment_context_in_chat_depth_block">
                        <label for="environment_context_injectionDepth">聊天内深度（0–100）</label>
                        <input id="environment_context_injectionDepth" class="text_pole" type="number" min="0" max="100" step="1" data-ec-setting="injectionDepth" />
                    </div>
                    <div id="environment_context_author_depth_block">
                        <label for="environment_context_authorNoteDepth">作者注释深度（0–100）</label>
                        <input id="environment_context_authorNoteDepth" class="text_pole" type="number" min="0" max="100" step="1" data-ec-setting="authorNoteDepth" />
                    </div>
                    <small class="environment-context-help">三种方式都使用 setExtensionPrompt()，只参与本次请求上下文，不创建消息、不保存附件、不污染聊天历史。</small>
                </section>

                <section>
                    <h4>动态格式预览</h4>
                    <pre id="environment_context_preview" class="environment-context-preview"></pre>
                    <div id="environment_context_cache_detail" class="environment-context-help"></div>
                    <div id="environment_context_status" class="environment-context-status">尚未读取环境状态</div>
                    <button id="environment_context_test" class="menu_button" type="button">立即测试并强制刷新</button>
                </section>
            </div>
        </div>
    </div>`;
}

function syncUiFromSettings() {
    const settings = currentSettings();
    document.querySelectorAll('#environment_context_settings [data-ec-setting]').forEach((element) => {
        const key = element.dataset.ecSetting;
        if (!(key in settings)) return;
        if (element.type === 'checkbox') element.checked = Boolean(settings[key]);
        else element.value = String(settings[key]);
    });
    updateConditionalUi(settings);
    const status = compatibleLastStatus(settings);
    updatePreview(buildEnvironmentPrompt(settings, status, clientTimeZone()), status);
}

function updateConditionalUi(settings = currentSettings()) {
    $('#environment_context_manual_location_block').toggle(settings.locationMode === 'manual');
    $('#environment_context_in_chat_depth_block').toggle(settings.injectionMode === 'in_chat');
    $('#environment_context_author_depth_block').toggle(settings.injectionMode === 'authors_note');
}

function bindSettingsEvents() {
    $('#environment_context_settings [data-ec-setting]').on('change input', function () {
        const key = this.dataset.ecSetting;
        const value = this.type === 'checkbox' ? this.checked : this.value;
        saveSetting(key, value);
        const settings = currentSettings();
        updateConditionalUi(settings);
        if (!settings.enabled) clearPrompt();
        else applyPrompt(settings, compatibleLastStatus(settings));
    });

    $('#environment_context_test').on('click', async function () {
        const button = this;
        button.disabled = true;
        try {
            await refreshEnvironment({ notify: true, forceRefresh: true });
        } finally {
            button.disabled = false;
        }
    });
}

jQuery(async () => {
    loadSettings();
    const container = document.getElementById('extensions_settings2');
    if (!container) {
        console.error('[环境上下文] 找不到扩展设置容器');
        return;
    }
    $(container).append(buildSettingsHtml());
    syncUiFromSettings();
    bindSettingsEvents();
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, onGenerationAfterCommands);
    await refreshEnvironment({ notify: false });
});