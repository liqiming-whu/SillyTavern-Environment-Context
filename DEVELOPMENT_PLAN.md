# 开发计划

## 目标

开发可从 SillyTavern Git URL 直接安装的跨平台环境上下文 UI Extension，在生成前按设置注入时间、天气、地点、日历、生日与纪念日、生理状态、电量和设备信息，不依赖 Server Plugin、Termux:API 或平台私有接口。

## v2.0.0 成功标准

- 仓库根目录直接包含标准 `manifest.json`、入口 JS、CSS 和模块文件，可被 `/api/extensions/install` 克隆并读取 manifest。
- 天气、地理编码、缓存全部迁入浏览器；无需 `enableServerPlugins`。
- 新增设备信息条目：设备名称、型号、平台可分别开关。
- 平台优先使用 User-Agent Client Hints，兼容传统 UA。
- 浏览器不提供的系统设备名称改为可编辑名称；不伪造型号。
- 保持 `setExtensionPrompt()` 临时注入、深度 1 默认值和聊天历史不落盘。
- 三天气源、自动定位、电量与设备信息失败互不阻塞。
- 天气提供方支持 auto，按 Open-Meteo → MET Norway → wttr.in 顺序容错。
- 设置页顶部支持角色卡多选，留空全部注入；支持 setExtensionPrompt 与自定义宏两类注入链路。
- 日历支持中国 chinese-days 节假日/农历/调休及其他地区 Nager.Date 公共假日。
- 支持 {{user}}/{{char}} 生日、自定义纪念日、经期自动推算和孕期追踪。
- 完成自动测试、CORS 实测、根目录实装、Git URL 安装/更新和发布归档。

## 当前状态

- [x] 核对 SillyTavern 1.18.0 Git 安装接口：仓库名决定安装目录，根目录必须有 `manifest.json`。
- [x] 核对官方 Extension-Weather 根目录结构。
- [x] 实测目标浏览器对 Open-Meteo Geocoding/Weather、MET Norway、wttr.in、Nominatim 均返回 CORS 200。
- [x] 将地理编码、天气请求和缓存迁入根目录 `weather.js`。
- [x] 删除 UI/Server 双目录、Server Plugin 和 Termux 安装脚本，整理为单一 UI Extension 根目录。
- [x] 新增 `device.js`：Client Hints 优先、传统 UA 回退。
- [x] 新增设备信息设置和提示词条目。
- [x] 25 项自动测试及语法检查通过。
- [x] 在目标 SillyTavern 实装 v1.2.0：设备信息、电量、Open-Meteo、MET Norway、提示词和聊天历史不落盘通过。
- [x] v1.2.1 定位 `signal timed out`：wttr.in 15 秒零字节，MET 当前正常但可能偶发超时；新增供应商级错误、wttr 6 秒阈值和 Open-Meteo 自动回退。
- [x] v1.3.0 新增反向地址解析供应商设置：auto/Nominatim/BigDataCloud/Photon；auto 按固定顺序容错，地址缓存键包含供应商；设置只在浏览器自动定位时显示。Git 安装后用同一宜昌坐标实测：Nominatim、BigDataCloud、Photon 和 auto 均成功，自动定位本轮系统定位偶发超时，不影响坐标→地址链路验证。
- [x] 创建公开 GitHub 仓库并 push；通过 SillyTavern `/api/extensions/install` 从仓库 URL 安装成功。
- [x] push 空值修复后，通过 SillyTavern `/api/extensions/update` 更新到 `a448e38`，确认假体感 0°C 已消失。
- [x] 导出 v1.2.0 发布归档；SHA-256 记录在工作区项目状态。
- [x] v2.0.0 实现天气 auto、角色卡多选、宏注入、日历、生日/纪念日、经期和孕期，固定引入 chinese-days 1.5.9 及 MIT 许可证。
- [x] v2.0.0 共 36 项自动测试与六个根模块语法检查通过，真实 chinese-days 2026 国庆/农历结果验证通过。
- [x] v2.0.1 根据实测修复角色卡绑定键、生日/纪念日和孕期预览，拆分三类注入分块，并为 `{{user}}`/`{{char}}` 分别增加经期和预计来潮/结束日期。
- [x] v2.0.1 共 39 项自动测试及六个根模块语法检查通过。
- [x] v2.0.2 修复原版角色列表初始化竞态，增加动态刷新；角色解析兼容下标、avatar、ID/UUID 和对象引用；未匹配时显示当前角色与绑定对象。
- [x] v2.0.2 共 41 项自动测试及六个根模块语法检查通过。
- [x] 用户确认原版 SillyTavern 和 TauriTavern 的动态角色列表、角色选择、绑定判断、未绑定提醒及绑定后的实际环境注入均通过。
- [ ] 生日/纪念日、经期/孕期预览和宏注册继续随用户日常使用观察；本次不扩大实测结论。

## 兼容与风险

- Battery Status API 在 Safari、Firefox 和部分桌面浏览器中可能不可用；只影响电量。
- Geolocation 需要权限与安全上下文。
- 设备平台通常可获取；型号取决于浏览器隐私策略；系统自定义设备名称没有通用 Web API。
- 浏览器直接请求第三方天气 API 依赖其 CORS 策略；当前五个实际端点已在目标 Android WebView 验证。
- 旧 v1.1.0 Server Plugin 可回滚，但 v1.2.0 正式安装前应移除旧 Server Plugin，避免维护两套数据路径。