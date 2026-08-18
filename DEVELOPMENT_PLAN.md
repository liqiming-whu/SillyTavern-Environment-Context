# 开发计划

## 目标

开发可从 SillyTavern Git URL 直接安装的跨平台环境上下文 UI Extension，在生成前按设置注入时间、星期、天气、地点、电量与设备信息，不依赖 Server Plugin、Termux:API 或平台私有接口。

## v1.2.0 成功标准

- 仓库根目录直接包含标准 `manifest.json`、入口 JS、CSS 和模块文件，可被 `/api/extensions/install` 克隆并读取 manifest。
- 天气、地理编码、缓存全部迁入浏览器；无需 `enableServerPlugins`。
- 新增设备信息条目：设备名称、型号、平台可分别开关。
- 平台优先使用 User-Agent Client Hints，兼容传统 UA。
- 浏览器不提供的系统设备名称改为可编辑名称；不伪造型号。
- 保持 `setExtensionPrompt()` 临时注入、深度 1 默认值和聊天历史不落盘。
- 三天气源、自动定位、电量与设备信息失败互不阻塞。
- 完成自动测试、CORS 实测、根目录实装、Git URL 安装/更新和发布归档。

## 当前状态

- [x] 核对 SillyTavern 1.18.0 Git 安装接口：仓库名决定安装目录，根目录必须有 `manifest.json`。
- [x] 核对官方 Extension-Weather 根目录结构。
- [x] 实测目标浏览器对 Open-Meteo Geocoding/Weather、MET Norway、wttr.in、Nominatim 均返回 CORS 200。
- [x] 将地理编码、天气请求和缓存迁入根目录 `weather.js`。
- [x] 删除 UI/Server 双目录、Server Plugin 和 Termux 安装脚本，整理为单一 UI Extension 根目录。
- [x] 新增 `device.js`：Client Hints 优先、传统 UA 回退。
- [x] 新增设备信息设置和提示词条目。
- [x] 21 项自动测试及语法检查通过。
- [ ] 在目标 SillyTavern 实装 v1.2.0 并验证 UI、设备信息、三天气源、定位、电量和聊天历史不落盘。
- [ ] 创建 GitHub 仓库，push 后通过 SillyTavern Git URL 安装并验证更新。
- [ ] 导出发布归档并记录 SHA-256。
- [ ] 真实模型生成由用户正常聊天时观察，避免主动产生模型费用或修改现有聊天。

## 兼容与风险

- Battery Status API 在 Safari、Firefox 和部分桌面浏览器中可能不可用；只影响电量。
- Geolocation 需要权限与安全上下文。
- 设备平台通常可获取；型号取决于浏览器隐私策略；系统自定义设备名称没有通用 Web API。
- 浏览器直接请求第三方天气 API 依赖其 CORS 策略；当前五个实际端点已在目标 Android WebView 验证。
- 旧 v1.1.0 Server Plugin 可回滚，但 v1.2.0 正式安装前应移除旧 Server Plugin，避免维护两套数据路径。