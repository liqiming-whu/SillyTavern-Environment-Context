# SillyTavern Environment Context

为 SillyTavern 在生成前注入现实时间、天气、地点、日历、纪念日、生理状态、电量和设备信息的跨平台 UI Extension。所有信息均通过临时扩展提示词或自定义宏参与请求，不修改 SillyTavern 本体，也不写入聊天历史。

## 功能

- 角色卡绑定：设置页顶部支持多选；留空表示全部角色卡均注入。
- 时间：使用 SillyTavern 官方 `{{date}}`、`{{time}}`、`{{weekday}}` 宏。
- 天气：自动、Open-Meteo、MET Norway、wttr.in，均不需要 API Key。
  - 自动模式按 Open-Meteo → MET Norway → wttr.in 顺序尝试，采用第一个成功结果并记录前序失败。
- 地点：手动城市或浏览器 Geolocation API；支持 Nominatim → BigDataCloud → Photon 自动容错。
- 日历：
  - 中国地区使用内置固定版本 `chinese-days`，支持法定节假日、农历和调休工作日。
  - 其他地区使用 Nager.Date 公共 API，按国家/地区代码读取公共假日。
- 纪念日：支持 `{{user}}` 生日、`{{char}}` 生日，以及任意名称和日期的自定义纪念日；配置后预览会显示日期、下次发生日期和剩余天数，留空字段不注入。
- 经期：`{{user}}` 与 `{{char}}` 可分别设置任意一次已知经期起始日期、周期时间和持续时间；插件自动推算最近一次经期、当前阶段、下次预计来潮和结束日期。
- 孕期：手动设置对象和怀孕起始日期，自动计算孕周、孕期阶段、状态和预产期；留空不注入。孕期有效时对应对象不重复注入经期状态。
- 电量：浏览器 Battery Status API，每次生成直接读取，不缓存。
- 设备信息：设备名称、设备型号和平台，可分别开关。

## 注入方式

支持四种方式：

1. 系统提示词区域。
2. 聊天内临时系统消息（默认，深度 1）。
3. 作者注释风格。
4. 宏占位符。

前三种方式使用 `setExtensionPrompt()`，宏模式则注册一个自定义宏，默认宏名为 `environment_context`。

宏模式不会自动把内容放进提示词。选择宏模式后，必须在角色卡、系统提示词或预设中显式写入：

```text
{{environment_context}}
```

如果修改了宏名，也要同步修改提示词中的占位符。宏返回值会再经过 SillyTavern 官方宏替换，因此其中的 `{{date}}`、`{{time}}`、`{{weekday}}`、`{{user}}` 和 `{{char}}` 仍可正常展开。

## 注入示范

以下地点、角色和日期均为占位示例，不是真实用户数据：

```text
【现实环境信息】
当前时间：{{date}} {{time}}
时区：<时区>
星期：{{weekday}}
日历：星期<星期>｜<工作日/周末/节假日/调休工作日>
今日节假日：<节假日名称>
农历：<农历日期>
下一个节假日：<节假日名称>（<YYYY-MM-DD>，还有<N>天）
地点：<城市> / <省州地区> / <国家>
天气：<天气状况>
温度：<温度>°C（体感：<体感温度>°C）
湿度：<湿度>%
风速：<风速> km/h <风向>

【生日和纪念日】
生日：{{user}}的生日，日期<YYYY-MM-DD>，下次<YYYY-MM-DD>（还有<N>天，届时<年龄>岁）
纪念日：<自定义纪念日名称>，日期<MM-DD>，下次<YYYY-MM-DD>（还有<N>天）

【角色生理状态】
- {{user}}：<经期阶段与自然状态描述>
  最近一次经期：<YYYY-MM-DD> 至 <YYYY-MM-DD>
  下次预计月经来潮：<YYYY-MM-DD>（还有<N>天）
  下次预计月经结束：<YYYY-MM-DD>
- {{char}}：孕<孕周>周（第<孕期阶段>孕期），<孕期状态>，预产期<YYYY-MM-DD>
（生理状态应自然影响精力、情绪、行动偏好与风险承受，不需要生硬医学播报）
电量：<百分比>%
充电状态：<充电中/未充电>
设备信息：
设备名称：<自定义设备名称或平台通用名称>
设备型号：<浏览器提供的型号或“浏览器未提供”>
平台：<Android/Windows/macOS/Linux/iOS/ChromeOS>
```

实际只输出已启用且有有效数据的条目；生日和纪念日配置后持续显示下次日期，当天改为庆祝提示；经期和孕期字段留空时不注入。

## 安装

仓库根目录是标准 SillyTavern UI Extension，无需 Server Plugin。在 SillyTavern 中打开：

```text
扩展 → 安装扩展 → 输入 Git 仓库 URL
```

仓库 URL：

```text
https://github.com/liqiming-whu/SillyTavern-Environment-Context
```

安装完成后刷新页面，在“扩展”设置中打开“环境上下文”。`manifest.json` 启用了 `auto_update`，后续可使用扩展更新功能。

## 架构

```text
SillyTavern UI Extension
├── index.js       设置 UI、角色卡过滤、浏览器状态采集、生成事件、宏与临时注入
├── context.js     设置归一化与提示词格式
├── weather.js     地理编码、三天气源、自动容错、超时与缓存
├── calendar.js    中国 chinese-days 与其他地区 Nager.Date 日历
├── wellbeing.js   纪念日、经期和孕期纯函数计算
├── device.js      平台和型号识别
├── vendor/        chinese-days 1.5.9 固定构建及 MIT 许可证
├── style.css
└── manifest.json
```

所有逻辑运行在浏览器端，不依赖 Termux:API、Operit API、Android 私有属性或服务端子进程。

## 隐私与网络

- 生日、纪念日、经期、孕期、电量和设备信息只保存在 SillyTavern 扩展设置或当前浏览器状态中。
- 手动地点发送给 Open-Meteo Geocoding。
- 自动定位坐标会发送给天气服务和选定的反向地理编码服务。
- 中国日历由仓库内置 `chinese-days` 计算，不发送日期到外部服务。
- 其他地区日历会向 `https://date.nager.at` 请求所选国家/地区的年度公共假日。
- 提示词只参与请求上下文，不创建聊天消息。

## 开发与测试

```bash
npm run check
npm test
```

自动测试共 39 项，覆盖设置归一化、天气自动容错、地址自动容错、缓存隔离、中国/国际日历、非当天纪念日、双对象经期、孕期、稳定角色卡绑定、旧设置迁移、宏模式、三类注入分块和 UI 必需字段。

第三方组件：`chinese-days` 1.5.9，MIT License；许可证见 `vendor/chinese-days.LICENSE`。

实现参考：

- `Gu-gu-gu-gu-gu/Weather-Calendar-Assistant`：宏模式、日历、纪念日、生理状态文案与算法参考。
- SillyTavern/Extension-Weather：浏览器天气扩展结构参考。
- `liqiming-whu/environment_provider`：MIT 天气码中文映射参考。

## 平台限制和待验证项

- Geolocation 需要浏览器授权及安全上下文。
- Battery Status API 在部分 Safari、Firefox 和桌面浏览器不可用。
- Nager.Date 和天气服务依赖网络及 CORS 策略。
- 角色卡多选、宏注册、动态纪念日编辑、日历和生理状态 UI 尚需在真实 SillyTavern 页面完成交互回归。
- 经期和孕期属于用户手动提供的情境数据，仅用于提示词上下文，不构成医疗建议。