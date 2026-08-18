import assert from 'node:assert/strict';
import test from 'node:test';
import {
    TimedCache,
    WTTR_WEATHER_CODES_ZH,
    createStatusService,
    degreesToDirection,
    readBrowserLocation,
    wttrCondition,
} from '../weather.js';

test('浏览器坐标参数被严格验证', () => {
    const location = readBrowserLocation({
        latitude: '30.669027', longitude: '111.438899', accuracy: '100', locationTimestamp: '1787037445931',
    });
    assert.equal(location.latitude, 30.669027);
    assert.equal(location.longitude, 111.438899);
    assert.equal(location.accuracy, 100);
    assert.equal(location.provider, 'browser-geolocation');
    assert.throws(() => readBrowserLocation({ latitude: '91', longitude: '0' }), /latitude/);
    assert.throws(() => readBrowserLocation({ latitude: '30', longitude: 'bad' }), /longitude/);
});

test('风向角转换为中文八方向', () => {
    assert.equal(degreesToDirection(0), '北');
    assert.equal(degreesToDirection(90), '东');
    assert.equal(degreesToDirection(225), '西南');
});

test('wttr.in 中文天气码覆盖 49 个 WWO 代码和扩展烟霾代码', () => {
    const expectedCodes = [
        113, 116, 119, 122, 143, 149, 176, 179, 182, 185, 200,
        227, 230, 248, 260, 263, 266, 281, 284, 293, 296,
        299, 302, 305, 308, 311, 314, 317, 320, 323, 326,
        329, 332, 335, 338, 350, 353, 356, 359, 362, 365,
        368, 371, 374, 377, 386, 389, 392, 395,
    ].map(String).sort();
    assert.deepEqual(Object.keys(WTTR_WEATHER_CODES_ZH).sort(), expectedCodes);
    assert.equal(WTTR_WEATHER_CODES_ZH[149], '烟霾');
    assert.equal(WTTR_WEATHER_CODES_ZH[353], '小阵雨');
});

test('wttr.in 优先中文描述，否则按 weatherCode 翻译', () => {
    assert.equal(wttrCondition('', '353', 'Light rain shower'), '小阵雨');
    assert.equal(wttrCondition('局部多云', '116', 'Partly cloudy'), '局部多云');
    assert.equal(wttrCondition('', '999', 'Unknown condition'), 'Unknown condition');
});

test('缓存刷新失败时只复用同键旧值并标记 stale', async () => {
    const cache = new TimedCache();
    await cache.read('wuhan', 0, async () => ({ temperature: 30 }));
    await cache.read('beijing', 60_000, async () => ({ temperature: 20 }));
    const stale = await cache.read('wuhan', 0, async () => { throw new Error('network down'); });
    assert.equal(stale.temperature, 30);
    assert.equal(stale.stale, true);
    assert.match(stale.refreshError, /network down/);
    await assert.rejects(cache.read('shanghai', 0, async () => { throw new Error('network down'); }));
});

test('强制刷新绕过正常 TTL 和失败负缓存', async () => {
    const cache = new TimedCache();
    let calls = 0;
    const loader = async () => ({ value: ++calls });
    await cache.read('same', 60_000, loader);
    const cached = await cache.read('same', 60_000, loader);
    const forced = await cache.read('same', 60_000, loader, true);
    assert.equal(cached.value, 1);
    assert.equal(cached.cached, true);
    assert.equal(forced.value, 2);
    assert.equal(forced.cached, false);
});

test('失败负缓存在 TTL 内避免重复网络请求', async () => {
    const cache = new TimedCache();
    let calls = 0;
    const loader = async () => { calls += 1; throw new Error('offline'); };
    await assert.rejects(cache.read('weather', 60_000, loader), /offline/);
    await assert.rejects(cache.read('weather', 60_000, loader), /offline/);
    assert.equal(calls, 1);
});

test('并发读取同键时合并为一次底层调用', async () => {
    const cache = new TimedCache();
    let calls = 0;
    const loader = async () => {
        calls += 1;
        await new Promise(resolve => setTimeout(resolve, 10));
        return { value: 1 };
    };
    const [one, two] = await Promise.all([
        cache.read('same', 60_000, loader),
        cache.read('same', 60_000, loader),
    ]);
    assert.equal(calls, 1);
    assert.equal(one.value, 1);
    assert.equal(two.value, 1);
});

test('手动地点和 Open-Meteo 天气可缓存', async () => {
    let httpCalls = 0;
    const requestJson = async (url) => {
        httpCalls += 1;
        if (url.hostname === 'geocoding-api.open-meteo.com') {
            return { results: [{ name: '武汉', admin1: '湖北', country: '中国', latitude: 30.5928, longitude: 114.3055, timezone: 'Asia/Shanghai' }] };
        }
        if (url.hostname === 'api.open-meteo.com') {
            return { timezone: 'Asia/Shanghai', current: { weather_code: 2, temperature_2m: 30, apparent_temperature: 33, relative_humidity_2m: 62, wind_speed_10m: 4, wind_direction_10m: 90 } };
        }
        throw new Error(`unexpected URL ${url}`);
    };
    const service = createStatusService({ requestJson });
    const query = { weather: '1', provider: 'open-meteo', locationMode: 'manual', location: '武汉' };
    const first = await service(query);
    const second = await service(query);
    assert.equal(first.ok, true);
    assert.equal(first.location.label, '武汉 / 湖北 / 中国');
    assert.equal(first.weather.condition, '局部多云');
    assert.equal(second.location.cached, true);
    assert.equal(second.weather.cached, true);
    assert.equal(httpCalls, 2);
});

test('浏览器定位坐标用于反向地理编码和天气并行请求', async () => {
    let activeHttp = 0;
    let maxActiveHttp = 0;
    const requestJson = async (url) => {
        activeHttp += 1;
        maxActiveHttp = Math.max(maxActiveHttp, activeHttp);
        await new Promise(resolve => setTimeout(resolve, 15));
        activeHttp -= 1;
        if (url.hostname === 'nominatim.openstreetmap.org') {
            return { address: { city: '宜昌市', state: '湖北省', country: '中国' } };
        }
        if (url.hostname === 'api.open-meteo.com') {
            return { timezone: 'Asia/Shanghai', current: { weather_code: 0, temperature_2m: 31, apparent_temperature: 34, relative_humidity_2m: 60, wind_speed_10m: 5, wind_direction_10m: 0 } };
        }
        throw new Error(`unexpected URL ${url}`);
    };
    const service = createStatusService({ requestJson });
    const status = await service({
        weather: '1', provider: 'open-meteo', locationMode: 'auto',
        latitude: '30.669027', longitude: '111.438899', accuracy: '100', locationTimestamp: '1787037445931',
    });
    assert.equal(status.ok, true);
    assert.equal(status.location.label, '宜昌市 / 湖北省 / 中国');
    assert.equal(status.location.provider, 'browser-geolocation');
    assert.equal(status.weather.condition, '晴');
    assert.equal(maxActiveHttp, 2);
});

test('非 Open-Meteo 提供方失败时回退并给出明确警告', async () => {
    const service = createStatusService({ requestJson: async (url) => {
        if (url.hostname === 'geocoding-api.open-meteo.com') {
            return { results: [{ name: '宜昌市', admin1: '湖北', country: '中国', latitude: 30.71444, longitude: 111.28472, timezone: 'Asia/Shanghai' }] };
        }
        if (url.hostname === 'wttr.in') throw new Error('wttr.in 请求超过 6 秒');
        if (url.hostname === 'api.open-meteo.com') {
            return { timezone: 'Asia/Shanghai', current: { weather_code: 1, temperature_2m: 31, apparent_temperature: 36, relative_humidity_2m: 65, wind_speed_10m: 6, wind_direction_10m: 90 } };
        }
        throw new Error(`unexpected URL ${url}`);
    } });
    const status = await service({ weather: '1', provider: 'wttr.in', locationMode: 'manual', location: '宜昌市', force: '1' });
    assert.equal(status.ok, true);
    assert.equal(status.weather.source, 'Open-Meteo');
    assert.equal(status.weather.fallbackFrom, 'wttr.in');
    assert.match(status.warnings.weather, /wttr\.in.*超过 6 秒.*回退到 Open-Meteo/);
});

test('自动定位缺少浏览器坐标时返回结构化错误', async () => {
    const service = createStatusService({ requestJson: async () => { throw new Error('should not fetch'); } });
    const status = await service({ weather: '1', provider: 'open-meteo', locationMode: 'auto' });
    assert.equal(status.ok, false);
    assert.match(status.errors.location, /latitude/);
});