import assert from 'node:assert/strict';
import test from 'node:test';
import { getCalendarContext } from '../calendar.js';
import { calculateCycleStatus, calculatePregnancyStatus, collectAnniversaries, collectCycleStatuses } from '../wellbeing.js';
import {
    buildEnvironmentPrompt,
    listCharacterBindings,
    matchesCharacterBinding,
    normalizeMacroName,
    normalizeSettings,
    resolveCurrentCharacter,
} from '../context.js';

test('中国日历使用 chinese-days 注入农历、节假日和调休信息', async () => {
    const mock = {
        getDayDetail: date => ({ name: ['2026-10-01', '2026-10-02'].includes(date) ? 'National Day,国庆节,3' : 'Saturday' }),
        getLunarDate: () => ({ lunarMonCN: '八月', lunarDayCN: '廿一', isLeap: false }),
        isHoliday: date => date === '2026-10-01' || date === '2026-10-02',
        isWorkday: () => false,
    };
    const calendar = await getCalendarContext('2026-10-01', 'CN', { chineseDays: mock });
    assert.equal(calendar.source, 'chinese-days');
    assert.equal(calendar.holidayName, '国庆节');
    assert.equal(calendar.lunarDate, '八月廿一');
    assert.equal(calendar.nextHoliday.date, '2026-10-02');
});

test('其他地区使用 Nager.Date 公共 API', async () => {
    const calls = [];
    const fetchImpl = async url => {
        calls.push(url);
        return { ok: true, json: async () => [{ date: '2026-12-25', name: 'Christmas Day', localName: 'Christmas Day' }] };
    };
    const calendar = await getCalendarContext('2026-12-25', 'US', { fetchImpl });
    assert.equal(calendar.source, 'Nager.Date');
    assert.equal(calendar.holidayName, 'Christmas Day');
    assert.match(calls[0], /PublicHolidays\/2026\/US/);
});

test('经期基准日期自动推算最近一次开始日期和当前状态', () => {
    const status = calculateCycleStatus('2026-01-01', 28, 5, '2026-03-01');
    assert.equal(status.recentStartDate, '2026-02-26');
    assert.equal(status.phase, 'menstruation');
    assert.equal(status.dayInCycle, 3);
    assert.match(status.description, /第4天/);
});

test('{{user}} 和 {{char}} 经期分别计算下次预计来潮和结束日期', () => {
    const cycles = collectCycleStatuses({
        userCycleStartDate: '2026-01-01', userCycleLength: 28, userPeriodDuration: 5,
        charCycleStartDate: '2026-01-08', charCycleLength: 30, charPeriodDuration: 6,
    }, '2026-03-01');
    assert.deepEqual(cycles.map(item => item.owner), ['{{user}}', '{{char}}']);
    assert.equal(cycles[0].status.nextStartDate, '2026-03-26');
    assert.equal(cycles[0].status.nextEndDate, '2026-03-30');
    assert.equal(cycles[1].status.nextStartDate, '2026-03-09');
    assert.equal(cycles[1].status.nextEndDate, '2026-03-14');
});

test('孕期按怀孕时间计算孕周、阶段和预产期', () => {
    const status = calculatePregnancyStatus('2026-01-01', '2026-03-12');
    assert.equal(status.week, 10);
    assert.equal(status.trimester, 1);
    assert.equal(status.dueDate, '2026-10-08');
    assert.match(status.statusText, /孕早期/);
});

test('生日和自定义纪念日配置后始终返回下次日期，当天标记 isToday', () => {
    const settings = {
        userBirthday: '1997-03-20', charBirthday: '',
        anniversaries: [{ name: '相识日', date: '2020-03-20', type: 'anniversary' }],
    };
    const upcoming = collectAnniversaries(settings, '2026-03-01');
    assert.deepEqual(upcoming.map(item => item.name), ['{{user}}的生日', '相识日']);
    assert.deepEqual(upcoming.map(item => item.nextDate), ['2026-03-20', '2026-03-20']);
    assert.deepEqual(upcoming.map(item => item.daysUntil), [19, 19]);
    const today = collectAnniversaries(settings, '2026-03-20');
    assert.deepEqual(today.map(item => item.isToday), [true, true]);
    assert.deepEqual(today.map(item => item.years), [29, 6]);
});

test('完整提示词包含日历、纪念日、孕期且孕期覆盖经期', () => {
    const prompt = buildEnvironmentPrompt({
        injectWeather: false, injectBattery: false, injectDevice: false,
        cycleEnabled: true, pregnancyEnabled: true, pregnancyOwner: '{{char}}',
    }, {
        calendar: { weekDayName: '四', dayType: '节假日', holidayName: '国庆节', lunarDate: '八月廿一', nextHoliday: { name: '元旦', date: '2027-01-01', daysUntil: 92 } },
        anniversaries: [{ name: '{{user}}的生日', type: 'birthday', years: 29, isToday: true }],
        cycles: [{ owner: '{{char}}', status: { description: '经期第1天', recentStartDate: '2026-03-01', recentEndDate: '2026-03-05', nextStartDate: '2026-03-29', nextEndDate: '2026-04-02', daysToNext: 28 } }],
        pregnancy: { week: 10, trimester: 1, statusText: '孕早期，容易疲倦或轻微不适', dueDate: '2026-10-08' },
    });
    assert.match(prompt, /今日节假日：国庆节/);
    assert.match(prompt, /农历：八月廿一/);
    assert.match(prompt, /【生日和纪念日】[\s\S]*生日：今天是\{\{user\}\}的生日（29岁）/);
    assert.match(prompt, /【角色生理状态】[\s\S]*- \{\{char\}\}：孕10周/);
    assert.doesNotMatch(prompt, /经期第1天/);
});

test('非当天纪念日与双对象经期会显示在独立分块预览', () => {
    const settings = normalizeSettings({
        injectTime: false, injectTimezone: false, injectWeekday: false,
        injectWeather: false, injectBattery: false, injectDevice: false,
        calendarEnabled: false,
        userBirthday: '1997-03-20',
        anniversaries: [{ name: '相识日', date: '04-01', type: 'anniversary' }],
        cycleEnabled: true,
        userCycleStartDate: '2026-01-01', userCycleLength: 28, userPeriodDuration: 5,
        charCycleStartDate: '2026-01-08', charCycleLength: 30, charPeriodDuration: 6,
    });
    const date = '2026-03-01';
    const prompt = buildEnvironmentPrompt(settings, {
        date,
        anniversaries: collectAnniversaries(settings, date),
        cycles: collectCycleStatuses(settings, date),
    });
    assert.match(prompt, /【生日和纪念日】/);
    assert.match(prompt, /\{\{user\}\}的生日，日期1997-03-20，下次2026-03-20（还有19天，届时29岁）/);
    assert.match(prompt, /相识日，日期04-01，下次2026-04-01（还有31天）/);
    assert.match(prompt, /【角色生理状态】/);
    assert.match(prompt, /\{\{user\}\}[\s\S]*下次预计月经来潮：2026-03-26[\s\S]*下次预计月经结束：2026-03-30/);
    assert.match(prompt, /\{\{char\}\}[\s\S]*下次预计月经来潮：2026-03-09[\s\S]*下次预计月经结束：2026-03-14/);
});

test('设置支持天气 auto、角色卡去重和安全宏名', () => {
    const settings = normalizeSettings({ weatherProvider: 'auto', boundCharacterIds: ['2', '2', '5'], macroName: '{{my macro}}' });
    assert.equal(settings.weatherProvider, 'auto');
    assert.deepEqual(settings.boundCharacterIds, ['2', '5']);
    assert.equal(settings.macroName, 'my_macro');
    assert.equal(normalizeMacroName('  {} '), 'environment_context');
});

test('v2.0.0 单对象经期设置迁移到对应 user 或 char 且保留周期长度', () => {
    const user = normalizeSettings({ cycleOwner: '{{user}}', cycleStartDate: '2026-01-01', cycleLength: 31, periodDuration: 6 });
    assert.equal(user.userCycleStartDate, '2026-01-01');
    assert.equal(user.userCycleLength, 31);
    assert.equal(user.userPeriodDuration, 6);
    const character = normalizeSettings({ cycleOwner: '{{char}}', cycleStartDate: '2026-02-01', cycleLength: 26, periodDuration: 4 });
    assert.equal(character.charCycleStartDate, '2026-02-01');
    assert.equal(character.charCycleLength, 26);
    assert.equal(character.charPeriodDuration, 4);
});

test('角色卡绑定留空全局注入，非空仅匹配选中角色', () => {
    assert.equal(matchesCharacterBinding([], '3'), true);
    assert.equal(matchesCharacterBinding(['2', '3'], 3), true);
    assert.equal(matchesCharacterBinding(['Alice.png'], ['Alice.png', '2', 'Alice']), true);
    assert.equal(matchesCharacterBinding(['2', '3'], 4), false);
    assert.equal(matchesCharacterBinding(['2'], []), false);
});

test('角色列表使用稳定 avatar，并兼容 UUID、名称和旧数组下标', () => {
    const characters = listCharacterBindings({ characters: [
        { avatar: 'Alice.png', name: 'Alice', id: 'alice-id' },
        { data: { avatar: 'Bob.png', name: 'Bob' }, uuid: 'bob-uuid' },
    ] });
    assert.equal(characters[0].id, 'Alice.png');
    assert.deepEqual(characters[0].keys, ['Alice.png', 'alice-id', 'Alice', '0']);
    assert.equal(characters[1].id, 'Bob.png');
    assert.deepEqual(characters[1].keys, ['bob-uuid', 'Bob.png', 'Bob', '1']);
});

test('当前角色支持数组下标、avatar、UUID 和直接对象引用', () => {
    const alice = { avatar: 'Alice.png', name: 'Alice', id: 'alice-id' };
    const bob = { data: { avatar: 'Bob.png', name: 'Bob' }, uuid: 'bob-uuid' };
    const characters = [alice, bob];
    assert.equal(resolveCurrentCharacter({ characters, characterId: '0' }).name, 'Alice');
    assert.equal(resolveCurrentCharacter({ characters, characterId: 'Bob.png' }).name, 'Bob');
    assert.equal(resolveCurrentCharacter({ characters, activeCharacterId: 'bob-uuid' }).name, 'Bob');
    assert.equal(resolveCurrentCharacter({ characters, characterId: alice }).name, 'Alice');
    assert.deepEqual(resolveCurrentCharacter({ characters, active_character: 'Writer.png', name2: 'Writer' }).keys, ['Writer.png', 'Writer']);
    assert.deepEqual(resolveCurrentCharacter({ characters, active_character: 'Bob.png', name2: 'SillyTavern System' }).keys, ['bob-uuid', 'Bob.png', 'Bob', '1']);
    assert.deepEqual(resolveCurrentCharacter({ characters: [], name2: 'SillyTavern System' }), {
        character: null, index: null, keys: [], name: '',
    });
    assert.deepEqual(resolveCurrentCharacter({ characters, groupId: 'group-1', active_character: 'Alice.png' }), {
        character: null, index: null, keys: [], name: '',
    });
});