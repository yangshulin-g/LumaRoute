# LumaRoute v0.1 设计说明

- 日期：2026-08-07
- 状态：已批准
- 产品名：LumaRoute
- 中文昵称：光路
- 定位语：多源汇聚，原画直达

## 1. 产品定位

LumaRoute 是一个开源方向的跨平台 Emby/Jellyfin 桌面客户端。它优先解决可靠连接多个影视服务器、通过主备线路访问媒体库，以及使用 mpv 高质量直放的问题。

首个版本只验证核心闭环：

1. 添加并登录多台 Emby/Jellyfin 服务器。
2. 为每台逻辑服务器配置主线路和备用线路。
3. 浏览媒体库并搜索当前服务器。
4. 使用独立 mpv 进程直放媒体。
5. 向服务端持续同步播放状态和进度。
6. 为 Windows、macOS、Linux 生成安装包。

LumaRoute 不提供、托管或销售媒体内容。用户负责其服务器和媒体来源的合法性。

## 2. 竞品调研结论

### Hills Lite 的优势

- 聚焦 Emby 用户，轻量且适合大型媒体库。
- 多服务器、线路切换和聚合能力较实用。
- 支持弹幕、外挂播放器、Anime4K、跳过片头片尾和 Trakt。
- 海报墙和 NAS 场景的性能口碑较好。

### 小幻影视（Rodel Player）的优势

- 原生 Windows 界面和较完整的影视详情体验。
- 使用 libmpv，支持 HDR、硬件解码、音频直通、自定义 mpv、补帧和 AI 字幕。
- 支持 Emby、Jellyfin、Plex 及本地、SMB、WebDAV、Alist 等来源。
- 具备跨源切换、聚合搜索和跨服务器进度能力。

### LumaRoute 的取舍

LumaRoute 不在 v0.1 复制两款产品的全部功能。第一阶段建立跨平台、可测试、可扩展的核心，再逐步吸收它们的优势。多服务器和备用线路从第一版就是核心模型，而不是后期补丁。

## 3. 已确认的产品决策

- 平台：Windows、macOS、Linux。
- 服务端：Emby 和 Jellyfin。
- 桌面框架：Tauri 2。
- 前端：Vue 3 + TypeScript。
- 业务逻辑：TypeScript。
- 原生层：最薄的 Rust 适配层，仅处理进程、IPC、安全存储和系统能力。
- 播放器：独立 mpv 进程，通过 JSON IPC 控制，不嵌入 WebView。
- 仓库形态：分层 monorepo。
- 开发方式：强调清晰接口、小模块和自动化测试，便于全程使用 AI 辅助开发。
- 商业化：v0.1 不实现支付、授权、权益或功能锁。
- 许可证：原型阶段不做不可逆选择；首次公开发布前必须确定开源许可证。未附许可证的公开仓库不能宣称为开源项目。

## 4. 范围

### 4.1 v0.1 包含

- 添加、编辑和删除多个服务器配置。
- Emby/Jellyfin 用户名密码登录。
- 为同一服务器配置多条访问线路。
- 手动指定首选线路。
- API 请求失败时按规则尝试备用线路。
- 播放启动失败时尝试备用线路。
- 浏览媒体库、电影、电视剧、季和剧集。
- 显示继续观看内容。
- 搜索当前服务器。
- 展示最小媒体详情。
- 原文件直放和不重新编码的直接串流/封装转换。
- mpv 播放、暂停、跳转、停止和基础状态获取。
- 播放开始、进度、暂停、跳转和停止上报。
- SQLite 配置存储和系统安全凭证存储。
- 脱敏日志。
- Windows、macOS、Linux 构建产物。

### 4.2 v0.1 不包含

- 多服务器聚合首页或聚合搜索。
- 在不同服务器中匹配同一媒体的跨源播放。
- 播放中断后的无感切线。
- 视频转码。
- 完整演职员、相关推荐等高级详情页。
- 弹幕、在线字幕搜索和外挂字幕管理。
- Anime4K、RIFE、Whisper 等增强功能。
- 自定义 mpv 配置界面。
- Plex、本地文件、SMB、WebDAV、Alist 或网盘来源。
- 下载和离线缓存。
- Trakt。
- 自动更新。
- 支付、订阅、License 或 Pro 功能。

## 5. 总体架构

```text
┌──────────────────────────────────────────────┐
│ apps/desktop                                 │
│ Vue 页面、路由、交互和 Tauri 桌面壳          │
└────────────────────┬─────────────────────────┘
                     │
┌────────────────────▼─────────────────────────┐
│ packages/core                                │
│ 服务端适配、统一模型、线路策略、播放会话、进度 │
└───────────────┬──────────────────┬───────────┘
                │                  │
┌───────────────▼────────┐ ┌───────▼───────────┐
│ packages/player         │ │ 平台适配器         │
│ PlayerEngine TS 接口    │ │ HTTP/SQLite/凭证   │
└───────────────┬────────┘ └───────┬───────────┘
                │                  │
┌───────────────▼──────────────────▼───────────┐
│ src-tauri                                     │
│ mpv 进程、受限 IPC、系统安全存储、打包         │
└──────────────────────────────────────────────┘
```

### 5.1 目录边界

```text
apps/
  desktop/            # Vue 3 UI 与 Tauri 应用
packages/
  core/               # 不依赖 Vue/Tauri 的纯 TypeScript 业务核心
  player/             # TypeScript PlayerEngine 与播放领域类型
docs/
  superpowers/specs/  # 已批准的产品和技术设计
```

`core` 不导入 Vue、Pinia、Tauri API 或具体数据库实现。它依赖接口，由 `desktop` 在组合根注入平台实现。

### 5.2 主要端口

- `HttpTransport`：向用户配置的服务器发起 HTTP 请求。
- `CredentialStore`：保存和读取访问 Token。
- `StoragePort`：持久化服务器、线路和偏好。
- `PlayerEngine`：控制播放并发出状态事件。
- `Clock`：提供可替换时间源，便于测试进度上报。
- `Logger`：集中执行字段脱敏。

## 6. 服务端与线路模型

### 6.1 逻辑服务器

```ts
type ServerKind = 'emby' | 'jellyfin'

interface ServerProfile {
  id: string
  name: string
  kind: ServerKind
  serverId: string
  userId: string
  username: string
  credentialKey: string
  preferredLineId: string
  lines: ServerLine[]
}

interface ServerLine {
  id: string
  label: string
  baseUrl: string
  priority: number
  enabled: boolean
}
```

`ServerProfile` 表示一个真实的 Emby/Jellyfin 实例和用户身份；`ServerLine` 表示访问该实例的不同 URL，例如局域网、公网域名和备用反向代理。

添加备用线路时必须读取并比对 `ServerId`。不一致的地址不能加入同一 Profile，而应创建另一台服务器。

### 6.2 线路选择规则

1. 首选线路最先尝试，其余启用线路按 `priority` 升序排列。
2. 连接超时、DNS/连接错误和 HTTP `502/503/504` 可以触发下一线路。
3. HTTP `401/403` 代表凭证问题，不通过切线掩盖。
4. 其他 `4xx` 代表请求或资源问题，不自动切线。
5. 某条线路成功后，本次应用会话优先粘附该线路，避免来回抖动。
6. 用户手动切线立即覆盖当前粘附结果。
7. 同一逻辑服务器的请求在任意时刻只执行一个明确的重试链，避免并行请求造成重复上报。

v0.1 在播放开始前可以换线重试。播放已经开始后若连接中断，应用保留最后位置并提供重试；自动恢复到备用线路属于后续版本。

## 7. Emby/Jellyfin 适配

### 7.1 统一接口

```ts
interface MediaServerAdapter {
  authenticate(input: LoginInput): Promise<AuthSession>
  getLibraries(context: RequestContext): Promise<Library[]>
  getItems(query: ItemQuery, context: RequestContext): Promise<Page<MediaItem>>
  getContinueWatching(context: RequestContext): Promise<MediaItem[]>
  search(query: SearchQuery, context: RequestContext): Promise<Page<MediaItem>>
  getPlaybackPlan(itemId: string, context: RequestContext): Promise<PlaybackPlan>
  reportPlayback(event: PlaybackReport, context: RequestContext): Promise<void>
}
```

Emby 和 Jellyfin 分别实现该接口，并将服务端 DTO 转换成统一领域模型。页面不得根据服务端类型直接解析原始响应。

### 7.2 HTTP 传输

远程请求通过 Tauri HTTP 插件的 TypeScript API 发起，避免 WebView CORS 限制。`HttpTransport` 只允许请求当前已保存 `ServerLine` 的基地址，并限制意外跨域重定向。

支持用户明确配置的 HTTP 或有效 HTTPS 地址。v0.1 不提供“忽略 TLS 证书错误”开关。

### 7.3 登录和凭证

1. 应用生成并长期保存稳定的设备 ID。
2. 使用用户名和密码调用服务端认证接口。
3. 获得 Token 后立即丢弃密码。
4. Token 通过 `CredentialStore` 保存在操作系统安全存储。
5. SQLite 只保存 `credentialKey`，不保存明文 Token 或密码。
6. Token 失效时要求用户重新登录。

## 8. 播放设计

### 8.1 播放计划

`core` 从适配器获取标准化 `PlaybackPlan`，至少包含：

- 媒体 ID 和媒体源 ID。
- 播放会话 ID。
- 不带凭证的串流 URL。
- 仅在内存中存在的请求头。
- 容器、编码、码率和时长。
- 直放或直接串流能力。
- 初始播放位置。

v0.1 优先选择原文件直放；允许服务端只换容器、不重新编码的直接串流。若服务端只能转码，应用显示明确原因，不启动转码任务。

### 8.2 mpv 生命周期

1. Rust 层启动固定版本的 mpv，使用 `--idle=yes` 和独立窗口。
2. 每次播放会话创建随机 IPC 地址。
3. Unix Socket 权限限制为当前用户；Windows Named Pipe 使用当前用户 ACL。
4. Token 不写入 URL、命令行或普通配置文件。
5. Rust 层通过 IPC 设置临时 HTTP 请求头，再执行 `loadfile`。
6. Rust 层订阅时间、时长、暂停、文件加载、播放结束和错误事件。
7. TypeScript `PlayerEngine` 将原生事件转换成稳定的领域事件。
8. 停止播放或退出应用时关闭会话并清理 IPC 资源。

### 8.3 PlayerEngine

```ts
interface PlayerEngine {
  play(plan: PlaybackPlan): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  seek(positionSeconds: number): Promise<void>
  stop(): Promise<void>
  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe
}
```

未来的 HDR、着色器、Anime4K、音频直通和自定义 mpv 参数通过播放配置扩展，不改变页面与服务端适配器。

### 8.4 进度同步

- mpv 确认文件开始播放后上报 Started。
- 播放期间每 10 秒上报 Progress。
- 暂停、恢复和跳转后立即上报最新状态。
- 正常结束、用户停止和应用关闭时上报 Stopped。
- 时间统一转换为服务端使用的 ticks（每秒 10,000,000）。
- 上报失败不会中断本地播放；应用保留最新待上报状态并在当前会话内有限重试。
- 异常退出最多丢失约 10 秒进度。

## 9. 界面设计

### 9.1 首次启动

- 选择 Emby 或 Jellyfin。
- 输入显示名称、主线路、用户名和密码。
- 登录成功后显示服务端名称和 ID。
- 可立即添加备用线路，也可稍后在设置中添加。

### 9.2 主界面

- 左侧栏切换逻辑服务器和媒体库。
- 首页显示继续观看和当前媒体库入口。
- 顶部提供当前服务器内搜索。
- 显示当前使用线路，但不以频繁通知打扰用户。

### 9.3 浏览和详情

- 海报墙使用服务端分页、虚拟列表和图片懒加载。
- 电影详情只展示标题、年份、简介、媒体摘要、播放和续播。
- 电视剧详情提供季和剧集列表。
- v0.1 不实现完整 PDP、演职员和相关推荐。

### 9.4 服务器设置

- 添加、编辑、删除和排序服务器。
- 添加、编辑、删除、启停和排序线路。
- 设置首选线路。
- 单独测试线路并显示成功、超时、认证失败或 ServerId 不一致。
- 删除服务器时同步删除其安全凭证。

## 10. 本地数据与状态

### 10.1 SQLite

SQLite 保存：

- `ServerProfile` 的非敏感字段。
- `ServerLine`。
- 当前选择的服务器、媒体库和界面偏好。
- 数据库迁移版本。

数据库通过版本化迁移演进。v0.1 不长期缓存完整媒体元数据，以服务端数据为准。

### 10.2 前端状态

- 页面状态与临时选择保留在 Vue 状态层。
- 远程查询缓存有明确过期时间，并按服务器 ID 隔离。
- 切换服务器时取消不再需要的请求。
- 页面不直接调用 SQLite、凭证存储或 mpv IPC。

## 11. 错误与日志

统一错误类别包括：

- `NetworkUnavailable`
- `LineTimeout`
- `AuthenticationExpired`
- `ServerMismatch`
- `UnsupportedServerVersion`
- `MediaNotDirectPlayable`
- `PlayerUnavailable`
- `PlaybackFailed`
- `StorageFailure`

用户界面显示可执行动作，例如切换线路、重新登录或复制诊断信息。诊断信息必须经过集中脱敏，至少移除：

- Access Token。
- 密码。
- URL 中的认证查询参数。
- HTTP Authorization 和 Emby Token 请求头。
- 用户明确标记为敏感的服务器地址。

## 12. 打包与分发

### 12.1 构建产物

- Windows x64：MSI 和 NSIS EXE。
- macOS：Intel 与 Apple Silicon 构建，可合并为 Universal DMG。
- Linux x64：AppImage 和 deb。

Windows ARM64、Linux ARM64 和 rpm 不属于 v0.1 验收范围。

### 12.2 mpv 分发

- Windows 和 macOS 随应用附带经过固定和校验的 mpv 构建。
- Linux AppImage 附带经过测试的 mpv；deb 可以声明兼容的系统 mpv 依赖。
- 启动时验证 mpv 是否存在和版本是否满足要求。
- 安装包附带 mpv、FFmpeg 及其他第三方组件的许可证和来源说明。
- 具体 mpv 版本在实施计划中通过实际兼容性测试固定，不在设计阶段虚构版本号。

### 12.3 签名

- CI 可先生成未签名的开发构建。
- 面向普通用户发布 macOS 包前需要 Apple Developer 签名和公证。
- Windows 正式签名证书在公开发布前准备。
- 所有 GitHub Release 产物生成 SHA-256 校验文件。

## 13. 测试策略

### 13.1 单元测试

- Emby/Jellyfin DTO 到领域模型的转换。
- 分页与搜索参数。
- 线路排序、粘附和错误分类。
- ticks 与秒的双向换算。
- 播放状态机与进度节流。
- 日志脱敏。

### 13.2 契约和集成测试

- 使用脱敏固定响应测试 Emby 适配器。
- CI 启动临时 Jellyfin 容器验证登录、浏览、搜索和进度接口。
- 使用本地模拟服务器制造超时、`503`、`401` 和 ServerId 不一致。
- 测试主线路失败后备用线路接管。
- 测试上报失败不会终止播放。

真实 Token、用户名和服务器地址不得进入仓库或 CI 日志。

### 13.3 播放测试

- 使用公开、体积受控的 H.264、H.265 和 AV1 样片进行 mpv 冒烟测试。
- 验证启动、加载、暂停、跳转、停止和结束事件。
- 编解码能力以各平台 mpv 构建和硬件支持为准；硬件不支持时允许软件解码，不能承诺所有设备流畅播放高码率内容。

### 13.4 UI 和打包测试

- UI 测试覆盖添加服务器、切换服务器、浏览、搜索和发起播放。
- Windows、macOS、Linux CI 分别构建安装包并运行启动冒烟测试。
- 正式发布前执行真实系统安装、卸载和升级检查。

## 14. v0.1 验收标准

1. 用户可以配置至少两台逻辑服务器，每台至少两条线路。
2. 备用线路必须经过 ServerId 一致性校验。
3. 主线路超时或返回 `503` 时，浏览请求能通过备用线路完成。
4. 播放启动连接失败时，能使用备用线路重新生成并加载播放计划。
5. 用户可以浏览电影、电视剧、季和剧集。
6. 用户可以搜索当前服务器。
7. 支持 mpv 原文件直放和不转码直接串流。
8. 正常播放时服务端进度与本地位置的误差通常不超过 10 秒。
9. Windows、macOS、Linux CI 均能生成约定产物。
10. 自动化检查确认日志与错误信息不包含凭证。

## 15. 后续演进

后续按核心价值而不是一次性复刻竞品推进：

1. 播放体验：音轨/字幕选择、外挂字幕、章节、片头片尾、音频直通、HDR 和 mpv 配置。
2. 画质增强：GLSL shader、Anime4K，再评估 RIFE 的平台成本。
3. 多服能力：线路健康检查、播放中断自动续播、聚合搜索、跨源匹配和跨服进度。
4. 社区功能：弹幕、Trakt 和外部播放器。
5. 更多来源：Plex、本地文件、SMB、WebDAV、Alist 等。
6. 商业化：在核心功能基本可行后再选择开源许可证、官方分发和可选服务模式。

每一阶段都应单独完成设计、验收和兼容性测试，避免 v0.1 范围失控。
