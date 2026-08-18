# SillyTavern Environment Context

为 SillyTavern 在每次生成前注入时间、天气、地点、电量和设备信息的跨平台 UI Extension。使用 `setExtensionPrompt()` 临时注入，不修改 SillyTavern 本体，不把环境信息写入聊天历史。

## 功能

- 时间：使用 SillyTavern 官方 `{{date}}`、`{{time}}`、`{{weekday}}` 宏。
- 天气：Open-Meteo、MET Norway、wttr.in，均不需要 API Key。
- 地点：手动城市或浏览器 Geolocation API；自动定位默认缓存 10 分钟。
- 电量：浏览器 Battery Status API，每次生成直接读取，不缓存。
- 设备信息：设备名称、设备型号和平台，可分别开关。
- 注入位置：系统提示词区域、聊天内临时系统消息、作者注释风格；默认聊天内深度 1。

默认格式示例：

```text
【现实环境信息】
当前时间：{{date}} {{time}}
时区：Asia/Shanghai
星期：{{weekday}}
地点：宜昌市 / 湖北省 / 中国
天气：晴
温度：32°C（体感：38°C）
湿度：63%
风速：6 km/h 东
电量：57%
充电状态：未充电
设备信息：
设备名称：我的手机
设备型号：V2405A
平台：Android
```

## 设备信息的浏览器边界

插件优先读取 User-Agent Client Hints，再回退传统 User-Agent：

- 平台通常可以识别为 Android、Windows、macOS、iOS、Linux 或 ChromeOS。
- 设备型号只有在浏览器愿意提供 Client Hints 或传统 UA 保留型号时才能获取；隐私裁剪后的浏览器会显示“浏览器未提供”。
- Web 平台没有读取用户设置的系统设备名称的通用 API。设置中的“设备名称”可手动填写；留空时使用“Android 设备”“Windows 设备”等通用名称。
- 插件不会为了看起来完整而伪造具体型号。

当前目标 Android WebView 实测：平台可正确识别为 Android，但 Client Hints 的 `model` 为空且传统 UA 被裁剪，因此型号显示“浏览器未提供”；可在设置中填写设备名称。

## 安装

仓库根目录就是标准 SillyTavern UI Extension，无需 Server Plugin。

在 SillyTavern 中打开：

```text
扩展 → 安装扩展 → 输入 Git 仓库 URL
```

仓库 URL：

```text
https://github.com/liqiming-whu/SillyTavern-Environment-Context
```

安装完成后刷新页面，在“扩展”设置中打开“环境上下文”。`manifest.json` 启用了 `auto_update`，后续可使用 SillyTavern 的扩展更新功能。

> Git 仓库发布前，上述 URL 处于待创建状态；当前开发机先使用同结构本地实装验证。

## 架构

```text
SillyTavern UI Extension
├── index.js       设置、浏览器状态采集、生成事件、临时注入
├── context.js     设置归一化与提示词格式
├── device.js      平台和型号识别
├── weather.js     地理编码、三天气源、超时与缓存
├── style.css
└── manifest.json
```

所有逻辑都运行在浏览器端：

- 不依赖 Termux、Termux:API、Operit API 或 Android 私有属性。
- 不启动服务端子进程。
- 不要求 `enableServerPlugins: true`。
- 天气请求直接访问第三方 HTTPS API；当前目标浏览器已验证相关服务允许 CORS。

## 平台兼容性

核心插件可在 Android、Windows、macOS 和 Linux 上使用，但具体能力受浏览器限制：

- Geolocation 需要用户授权，并要求 HTTPS、localhost 或浏览器认可的安全上下文。
- Battery Status API 在部分 Safari、Firefox 或桌面浏览器中不可用；此时只影响电量，其他条目继续工作。
- 平台通常可识别；型号和电量属于浏览器可选能力。

## 隐私与网络

- 电量和设备信息只在当前浏览器读取，不发送给外部服务。
- 手动地点发送给 Open-Meteo Geocoding。
- 自动定位坐标发送给当前天气服务，并发送给 OpenStreetMap Nominatim 以显示城市。
- 提示词只参与请求上下文，不创建聊天消息。

## 开发与测试

```bash
npm run check
npm test
```

项目不依赖第三方 npm 包。开发基线：SillyTavern 1.18.0，commit `8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8`。

天气实现参考：

- SillyTavern/Extension-Weather：`c169a3cacaefd032d2857417564e0330b516a1b3`
- `liqiming-whu/environment_provider`：`4b36229a6978b46edd8f5b57f644eb8ae9a006fa`，MIT 天气码中文映射

## 当前验证状态

- 21 项自动测试和四个根模块语法检查通过。
- 目标浏览器实测 Open-Meteo Geocoding、Open-Meteo Weather、MET Norway、wttr.in、Nominatim 均可跨域读取。
- 待完成：v1.2.0 根目录结构真机实装、SillyTavern Git URL 安装/更新和真实模型生成验证。