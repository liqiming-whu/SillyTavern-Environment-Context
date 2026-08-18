import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildEnvironmentPrompt,
    markStatusStale,
    normalizeSettings,
    sanitizeInline,
} from '../context.js';
import { detectModel, detectPlatform, readBrowserDevice } from '../device.js';

test('默认格式使用 SillyTavern 官方时间宏并动态输出天气和电量', () => {
    const prompt = buildEnvironmentPrompt(undefined, {
        time: { timeZone: 'Asia/Shanghai' },
        location: { label: '武汉 / 湖北 / 中国', stale: false },
        weather: {
            condition: '晴',
            temperature: 34,
            feelsLike: 36.2,
            humidity: 45,
            windSpeed: 12,
            windDirection: '东',
            stale: false,
        },
        battery: { percentage: 72, charging: false, temperature: 33.2, stale: false },
    }, 'Asia/Shanghai');

    assert.match(prompt, /当前时间：\{\{date\}\} \{\{time\}\}/);
    assert.match(prompt, /星期：\{\{weekday\}\}/);
    assert.match(prompt, /地点：武汉 \/ 湖北 \/ 中国/);
    assert.match(prompt, /温度：34°C（体感：36\.2°C）/);
    assert.match(prompt, /充电状态：未充电/);
    assert.doesNotMatch(prompt, /电池温度/);
});

test('关闭字段后动态格式不会保留对应行', () => {
    const prompt = buildEnvironmentPrompt({
        injectTime: false,
        injectTimezone: false,
        injectWeekday: false,
        injectWeather: false,
        injectBattery: true,
        showCharging: false,
        injectDevice: false,
    }, {
        battery: { percentage: 37, charging: false },
    });

    assert.equal(prompt, '【现实环境信息】\n电量：37%');
});

test('天气空值不会被错误格式化为 0', () => {
    const prompt = buildEnvironmentPrompt({
        injectTime: false,
        injectTimezone: false,
        injectWeekday: false,
        injectBattery: false,
        injectDevice: false,
        showLocation: false,
    }, { weather: { condition: '局部多云', temperature: 20, feelsLike: null, humidity: null, windSpeed: null } });
    assert.match(prompt, /温度：20°C/);
    assert.doesNotMatch(prompt, /体感：0°C|湿度：0%|风速：0/);
});

test('陈旧数据在注入文本中显示具体采集时间', () => {
    const prompt = buildEnvironmentPrompt({ injectWeather: false }, {
        battery: {
            percentage: 71,
            charging: false,
            stale: true,
            fetchedAt: '2026-08-18T04:21:19.548Z',
        },
    });
    assert.match(prompt, /数据状态：电量使用旧缓存/);
    assert.match(prompt, /采集于 2026-08-18 04:21:19 UTC/);
});

test('旧状态会被标记为缓存且不修改原对象', () => {
    const original = { battery: { percentage: 50, stale: false }, weather: { stale: false } };
    const stale = markStatusStale(original);
    assert.equal(stale.battery.stale, true);
    assert.equal(stale.weather.stale, true);
    assert.equal(stale.meta.uiCache, true);
    assert.equal(original.battery.stale, false);
});

test('设置归一化限制刷新间隔和深度', () => {
    const settings = normalizeSettings({
        weatherRefreshMinutes: 999,
        injectionDepth: -5,
        authorNoteDepth: 999,
        weatherProvider: 'invalid',
        reverseGeocodingProvider: 'invalid',
    });
    assert.equal(settings.weatherRefreshMinutes, 180);
    assert.equal(settings.injectionDepth, 0);
    assert.equal(settings.authorNoteDepth, 100);
    assert.equal(settings.weatherProvider, 'open-meteo');
    assert.equal(settings.reverseGeocodingProvider, 'auto');
});

test('设备信息作为独立条目输出，并允许自定义设备名称', () => {
    const prompt = buildEnvironmentPrompt({
        injectTime: false,
        injectTimezone: false,
        injectWeekday: false,
        injectWeather: false,
        injectBattery: false,
        injectDevice: true,
        customDeviceName: '我的手机',
    }, { device: { platform: 'Android', model: 'V2405A' } });
    assert.equal(prompt, '【现实环境信息】\n设备信息：\n设备名称：我的手机\n设备型号：V2405A\n平台：Android');
});

test('平台识别优先使用 Client Hints，并兼容传统 UA', () => {
    assert.equal(detectPlatform({ userAgentData: { platform: 'Android' }, userAgent: 'Windows NT 10.0' }), 'Android');
    assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'Windows');
    assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }), 'macOS');
});

test('设备型号优先使用高熵 Client Hints，传统 Android UA 可回退解析', () => {
    assert.equal(detectModel({ highEntropy: { model: 'V2405A' }, userAgent: 'redacted' }), 'V2405A');
    assert.equal(detectModel({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro Build/AP3A.241105.008) AppleWebKit/537.36' }), 'Pixel 9 Pro');
});

test('浏览器不提供型号时只返回平台，不伪造具体型号或设备名', async () => {
    const device = await readBrowserDevice({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        userAgentData: { platform: 'Windows', getHighEntropyValues: async () => ({ model: '' }) },
    });
    assert.equal(device.platform, 'Windows');
    assert.equal(device.model, '');
    assert.equal(device.name, '');
});

test('外部文本会被压成单行并移除尖括号', () => {
    assert.equal(sanitizeInline('  <bad>\n城市\t名称  '), 'bad 城市 名称');
});