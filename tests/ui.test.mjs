import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');

test('设置项按需求包含角色卡多选、天气自动、日历、纪念日、经期、孕期和宏模式', () => {
    for (const text of [
        'multiple data-ec-setting="boundCharacterIds"',
        '留空表示所有角色卡均注入',
        '自动（Open-Meteo → MET Norway → wttr.in）',
        '中国（chinese-days：节假日、农历、调休）',
        '其他地区使用 Nager.Date 公共 API',
        '{{user}} 的生日', '{{char}} 的生日', '添加纪念日',
        '{{user}} 经期', '{{char}} 经期', '任意一次已知经期起始日期',
        '下次预计来潮和结束日期', '周期时间（天，15–60）',
        '怀孕时间', '孕周、孕期阶段、状态与预产期',
        '<option value="macro">宏占位符</option>',
        '必须在角色卡、系统提示词或预设中写入',
        'CHARACTER_PAGE_LOADED', 'SETTINGS_LOADED_AFTER', 'scheduleCharacterOptionRefresh',
        '当前角色：', '已绑定：', '请打开绑定角色卡的聊天界面后重试', '已保存，当前列表未找到',
        'active_character', 'this_chid',
    ]) assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('宏模式不会同时写入扩展提示词', () => {
    assert.match(source, /settings\.injectionMode === 'macro'[\s\S]*setExtensionPrompt\(PROMPT_KEY, '', extension_prompt_types\.NONE/);
    assert.match(source, /registerMacro\(name, \(\) => \([\s\S]*context\.substituteParams\(macroPromptCache\)/);
});