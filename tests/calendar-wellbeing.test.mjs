import assert from 'node:assert/strict';
import test from 'node:test';
import { getCalendarContext } from '../calendar.js';
import { calculateCycleStatus, calculatePregnancyStatus, collectAnniversaries } from '../wellbeing.js';
import { buildEnvironmentPrompt, matchesCharacterBinding, normalizeMacroName, normalizeSettings } from '../context.js';

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

test('孕期按怀孕时间计算孕周、阶段和预产期', () => {
    const status = calculatePregnancyStatus('2026-01-01', '2026-03-12');
    assert.equal(status.week, 10);
    assert.equal(status.trimester, 1);
    assert.equal(status.dueDate, '2026-10-08');
    assert.match(status.statusText, /孕早期/);
});

test('生日和自定义纪念日仅在同月同日注入', () => {
    const events = collectAnniversaries({
        userBirthday: '1997-03-20', charBirthday: '',
        anniversaries: [{ name: '相识日', date: '2020-03-20', type: 'anniversary' }],
    }, '2026-03-20');
    assert.deepEqual(events.map(item => item.name), ['{{user}}的生日', '相识日']);
    assert.deepEqual(events.map(item => item.years), [29, 6]);
});

test('完整提示词包含日历、纪念日、孕期且孕期覆盖经期', () => {
    const prompt = buildEnvironmentPrompt({
        injectWeather: false, injectBattery: false, injectDevice: false,
        cycleEnabled: true, pregnancyEnabled: true, pregnancyOwner: '{{char}}',
    }, {
        calendar: { weekDayName: '四', dayType: '节假日', holidayName: '国庆节', lunarDate: '八月廿一', nextHoliday: { name: '元旦', date: '2027-01-01', daysUntil: 92 } },
        anniversaries: [{ name: '{{user}}的生日', type: 'birthday', years: 29 }],
        cycle: { description: '经期第1天' },
        pregnancy: { week: 10, trimester: 1, statusText: '孕早期，容易疲倦或轻微不适', dueDate: '2026-10-08' },
    });
    assert.match(prompt, /今日节假日：国庆节/);
    assert.match(prompt, /农历：八月廿一/);
    assert.match(prompt, /生日：今天是\{\{user\}\}的生日（29岁）/);
    assert.match(prompt, /- \{\{char\}\}：孕10周/);
    assert.doesNotMatch(prompt, /经期第1天/);
});

test('设置支持天气 auto、角色卡去重和安全宏名', () => {
    const settings = normalizeSettings({ weatherProvider: 'auto', boundCharacterIds: ['2', '2', '5'], macroName: '{{my macro}}' });
    assert.equal(settings.weatherProvider, 'auto');
    assert.deepEqual(settings.boundCharacterIds, ['2', '5']);
    assert.equal(settings.macroName, 'my_macro');
    assert.equal(normalizeMacroName('  {} '), 'environment_context');
});

test('角色卡绑定留空全局注入，非空仅匹配选中角色', () => {
    assert.equal(matchesCharacterBinding([], '3'), true);
    assert.equal(matchesCharacterBinding(['2', '3'], 3), true);
    assert.equal(matchesCharacterBinding(['2', '3'], 4), false);
    assert.equal(matchesCharacterBinding(['2'], null), false);
});