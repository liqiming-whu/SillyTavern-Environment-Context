# SillyTavern Environment Context 开发规则

1. 本项目面向 Android Termux 中运行的 SillyTavern，不修改 SillyTavern 本体。
2. 仓库根目录是 SillyTavern 可通过 Git URL 安装的标准 UI Extension：入口、环境格式、设备、天气、日历、生理状态、样式和 `vendor/` 依赖均直接位于仓库内。浏览器负责设备状态、地理编码、天气/日历请求、缓存、宏或 `setExtensionPrompt()` 注入；不再需要 Server Plugin。
3. 时间与星期优先使用 SillyTavern 官方宏，不从 Server Plugin 拼接固定值；宏注入模式必须提示用户在角色卡、系统提示词或预设中显式放置占位符，且不得与扩展提示词重复注入。
4. 禁止重新引入 Termux:API、Android 私有电量属性或服务端子进程。电量每次生成直接从浏览器读取，不缓存；自动定位在 UI 层缓存，默认 10 分钟。反向地址解析支持 auto/Nominatim/BigDataCloud/Photon；auto 顺序固定为 Nominatim → BigDataCloud → Photon，地址缓存键必须包含供应商。天气 auto 顺序固定为 Open-Meteo → MET Norway → wttr.in。
5. 位置和天气读取失败时可以使用同一缓存键的旧值并明确标记 stale；不得阻塞生成或把其他地点/提供方的缓存混用。电量读取失败应显示不可用，不复用旧电量。
6. 注入内容不得写入聊天历史；默认使用 `setExtensionPrompt()` 的聊天内系统消息深度 1。
7. 修改后至少执行 `npm test`、`npm run check`、残留依赖扫描、Git 安装结构检查。浏览器权限、CORS、定位、联网、通过 SillyTavern Git 安装/更新与真实生成必须在用户设备上验证。
8. 角色卡绑定使用角色 avatar 作为稳定 ID，并兼容旧数组下标；留空表示全局注入。生日/纪念日和生理状态必须在预览中可见，注入分为现实环境、生日和纪念日、角色生理状态三块。
9. 参考权威：当前 SillyTavern 源码、官方 Git Extension installer、SillyTavern/Extension-Weather；Operit `examples/message_insert` 仅作为移动端采集和非持久注入设计参考。
