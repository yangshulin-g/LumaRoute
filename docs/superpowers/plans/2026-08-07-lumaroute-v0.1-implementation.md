# LumaRoute v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可在 Windows、macOS、Linux 使用的 LumaRoute v0.1，使用户能安全登录多台 Emby/Jellyfin 服务器、配置主备线路、浏览与搜索媒体，并通过独立 mpv 直放且同步进度。

**Architecture:** 采用分层 pnpm monorepo：`packages/core` 保存纯 TypeScript 领域逻辑与端口，`packages/player` 保存稳定播放契约，`apps/desktop` 负责 Vue UI、应用组合与 Tauri 平台适配。Rust 原生层只承接 mpv 进程/受限 JSON IPC、系统凭证和必要系统能力；所有远端 DTO 在 Emby/Jellyfin 适配器内归一化。

**Tech Stack:** Tauri 2、Vue 3、TypeScript、Pinia、Vue Router、TanStack Query/Virtual、Vitest、Vue Test Utils、Playwright、Rust stable、Tokio、SQLite、操作系统 Keychain/Credential Manager/Secret Service、独立 mpv JSON IPC、GitHub Actions。

## Global Constraints

- 支持平台固定为 Windows、macOS、Linux；v0.1 验收产物为 Windows x64 MSI/NSIS EXE、macOS Intel/Apple Silicon（可合并 Universal DMG）、Linux x64 AppImage/deb。
- 服务端仅支持 Emby 和 Jellyfin；Plex、本地文件、SMB、WebDAV、Alist 与网盘来源不进入 v0.1。
- 桌面框架使用 Tauri 2，前端使用 Vue 3 + TypeScript，业务逻辑使用 TypeScript。
- Rust 适配层保持最薄，只处理进程、IPC、安全存储和系统能力。
- 播放器是独立 mpv 进程，通过 JSON IPC 控制，不嵌入 WebView。
- `packages/core` 不导入 Vue、Pinia、Tauri API 或具体数据库实现。
- `ServerProfile` 表示真实 Emby/Jellyfin 实例和用户身份；`ServerLine` 只表示访问该实例的一个 URL。
- 备用线路加入 Profile 前必须校验 `ServerId` 一致。
- 无会话粘附时首选线路先尝试；线路成功或用户手动选择后，该会话粘附线路先尝试，其余启用线路按首选与 `priority` 升序串行尝试；仅网络/DNS/超时与 HTTP `502/503/504` 触发切线，`401/403` 和其他 `4xx` 不切线。
- 播放开始前允许换线重试；播放已开始后的自动无感切线不属于 v0.1。
- HTTP 仅访问用户明确配置的线路，拒绝意外跨域重定向；支持用户明确配置的 HTTP 或有效 HTTPS，不提供忽略 TLS 证书错误。
- 密码认证成功后立即丢弃；Token 仅存操作系统安全存储，不进入 SQLite、URL、命令行、普通配置、夹具或日志。
- 播放优先原文件直放，允许只换容器且不重新编码的直接串流；服务端只能转码时返回 `MediaNotDirectPlayable`。
- mpv Token/请求头只保留在内存并通过受限 IPC 设置；每次会话使用随机 IPC 地址和当前用户权限。
- mpv 确认开始后上报 Started；播放期间每 10 秒上报 Progress；暂停、恢复、跳转后立即上报；停止、结束、应用关闭时上报 Stopped。
- 时间统一以每秒 `10_000_000` ticks 换算；上报失败不终止本地播放，只在当前会话内有限重试。
- SQLite 只保存非敏感服务器/线路、界面偏好和迁移版本，不长期缓存完整媒体元数据。
- 页面不直接解析服务端 DTO，也不直接访问 SQLite、系统凭证或 mpv IPC。
- 海报墙必须服务端分页、虚拟化和图片懒加载；远程缓存按服务器 ID 隔离，切服取消失效请求。
- 日志与诊断集中脱敏 Token、密码、认证查询参数、Authorization/Emby Token 请求头和用户标记敏感的服务器地址。
- v0.1 不实现跨服聚合/跨源匹配、视频转码、弹幕、在线/外挂字幕管理、画质增强、自定义 mpv UI、下载、Trakt、自动更新、支付/订阅/License/Pro。
- 原型阶段不做不可逆许可证选择；首次公开发布前必须确定项目许可证，并附带 mpv/FFmpeg 等第三方组件许可证与来源。
- mpv 版本不得凭空填写；必须通过 Task 13 的真实兼容性测试后把实际版本、来源和 SHA-256 固定到清单。
- 每个行为变更执行失败测试 → 最小实现 → 通过测试；每个任务结束前运行该任务测试和全量受影响质量门。
- 单个模块只承担一个职责；生产文件目标不超过 250 行，超出时按本计划列出的职责边界拆分，不创建“全能”服务文件。

---

## 事实来源与执行约定

- 产品、架构、安全和验收事实来源：`docs/superpowers/specs/2026-08-07-lumaroute-v0.1-design.md`。
- 任务顺序、文件路径和接口事实来源：本计划。
- 执行前读取根目录 `AGENTS.md` 与匹配的 `.cursor/rules/*.mdc`。
- 每个任务在独立变更中完成；前一任务测试通过后才开始下一任务。
- 本计划中的提交步骤供实施阶段使用；创建本计划的会话不执行提交。

## 精确文件清单

### 工作区与共享契约

- `.editorconfig`
- `.gitignore`
- `.nvmrc`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `eslint.config.mjs`
- `prettier.config.mjs`
- `vitest.workspace.ts`
- `playwright.config.ts`
- `packages/player/package.json`
- `packages/player/tsconfig.json`
- `packages/player/vitest.config.ts`
- `packages/player/src/index.ts`
- `packages/player/src/types.ts`
- `packages/player/src/player-engine.ts`
- `packages/player/src/player-engine.test.ts`

### Core

- `packages/core/package.json`
- `packages/core/tsconfig.json`
- `packages/core/vitest.config.ts`
- `packages/core/src/index.ts`
- `packages/core/src/errors/app-error.ts`
- `packages/core/src/system/health.ts`
- `packages/core/src/system/health.test.ts`
- `packages/core/src/ports/clock.ts`
- `packages/core/src/ports/credential-store.ts`
- `packages/core/src/ports/http-transport.ts`
- `packages/core/src/ports/logger.ts`
- `packages/core/src/ports/storage-port.ts`
- `packages/core/src/server/types.ts`
- `packages/core/src/server/server-catalog.ts`
- `packages/core/src/server/server-catalog.test.ts`
- `packages/core/src/server/line-order.ts`
- `packages/core/src/server/line-order.test.ts`
- `packages/core/src/server/route-executor.ts`
- `packages/core/src/server/route-executor.test.ts`
- `packages/core/src/server/line-service.ts`
- `packages/core/src/server/line-service.test.ts`
- `packages/core/src/auth/types.ts`
- `packages/core/src/auth/authentication-adapter.ts`
- `packages/core/src/auth/login-service.ts`
- `packages/core/src/auth/login-service.test.ts`
- `packages/core/src/media/types.ts`
- `packages/core/src/media/media-server-adapter.ts`
- `packages/core/src/media/media-service.ts`
- `packages/core/src/media/media-service.test.ts`
- `packages/core/src/adapters/emby/emby-dto.ts`
- `packages/core/src/adapters/emby/emby-mapper.ts`
- `packages/core/src/adapters/emby/emby-adapter.ts`
- `packages/core/src/adapters/emby/emby-adapter.test.ts`
- `packages/core/src/adapters/jellyfin/jellyfin-dto.ts`
- `packages/core/src/adapters/jellyfin/jellyfin-mapper.ts`
- `packages/core/src/adapters/jellyfin/jellyfin-adapter.ts`
- `packages/core/src/adapters/jellyfin/jellyfin-adapter.test.ts`
- `packages/core/src/playback/ticks.ts`
- `packages/core/src/playback/ticks.test.ts`
- `packages/core/src/playback/playback-service.ts`
- `packages/core/src/playback/playback-service.test.ts`
- `packages/core/src/playback/progress-reporter.ts`
- `packages/core/src/playback/progress-reporter.test.ts`
- `packages/core/src/logging/redact.ts`
- `packages/core/src/logging/redact.test.ts`
- `packages/core/src/logging/diagnostic-service.ts`
- `packages/core/src/logging/diagnostic-service.test.ts`

### Desktop TypeScript/Vue

- `apps/desktop/package.json`
- `apps/desktop/tsconfig.json`
- `apps/desktop/tsconfig.node.json`
- `apps/desktop/vite.config.ts`
- `apps/desktop/vitest.config.ts`
- `apps/desktop/index.html`
- `apps/desktop/src/env.d.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/App.vue`
- `apps/desktop/src/App.test.ts`
- `apps/desktop/src/styles.css`
- `apps/desktop/src/router/index.ts`
- `apps/desktop/src/composition/create-services.ts`
- `apps/desktop/src/composition/service-types.ts`
- `apps/desktop/src/platform/http/origin-policy.ts`
- `apps/desktop/src/platform/http/origin-policy.test.ts`
- `apps/desktop/src/platform/http/tauri-http-transport.ts`
- `apps/desktop/src/platform/http/tauri-http-transport.test.ts`
- `apps/desktop/src/platform/storage/sql-client.ts`
- `apps/desktop/src/platform/storage/sqlite-storage.ts`
- `apps/desktop/src/platform/storage/sqlite-storage.test.ts`
- `apps/desktop/src/platform/credentials/tauri-credential-store.ts`
- `apps/desktop/src/platform/credentials/tauri-credential-store.test.ts`
- `apps/desktop/src/platform/device/device-identity.ts`
- `apps/desktop/src/platform/device/device-identity.test.ts`
- `apps/desktop/src/platform/player/tauri-player-engine.ts`
- `apps/desktop/src/platform/player/tauri-player-engine.test.ts`
- `apps/desktop/src/platform/images/secure-image-loader.ts`
- `apps/desktop/src/platform/images/secure-image-loader.test.ts`
- `apps/desktop/src/stores/app-store.ts`
- `apps/desktop/src/stores/app-store.test.ts`
- `apps/desktop/src/stores/server-store.ts`
- `apps/desktop/src/stores/server-store.test.ts`
- `apps/desktop/src/stores/media-store.ts`
- `apps/desktop/src/stores/media-store.test.ts`
- `apps/desktop/src/stores/player-store.ts`
- `apps/desktop/src/stores/player-store.test.ts`
- `apps/desktop/src/views/OnboardingView.vue`
- `apps/desktop/src/views/OnboardingView.test.ts`
- `apps/desktop/src/views/HomeView.vue`
- `apps/desktop/src/views/HomeView.test.ts`
- `apps/desktop/src/views/LibraryView.vue`
- `apps/desktop/src/views/LibraryView.test.ts`
- `apps/desktop/src/views/SearchView.vue`
- `apps/desktop/src/views/SearchView.test.ts`
- `apps/desktop/src/views/MediaDetailView.vue`
- `apps/desktop/src/views/MediaDetailView.test.ts`
- `apps/desktop/src/views/ServerSettingsView.vue`
- `apps/desktop/src/views/ServerSettingsView.test.ts`
- `apps/desktop/src/components/AppShell.vue`
- `apps/desktop/src/components/ServerSwitcher.vue`
- `apps/desktop/src/components/LibrarySidebar.vue`
- `apps/desktop/src/components/LineEditor.vue`
- `apps/desktop/src/components/LineStatus.vue`
- `apps/desktop/src/components/VirtualPosterGrid.vue`
- `apps/desktop/src/components/VirtualPosterGrid.test.ts`
- `apps/desktop/src/components/MediaCard.vue`
- `apps/desktop/src/components/PlayerControls.vue`
- `apps/desktop/src/components/DiagnosticPanel.vue`
- `apps/desktop/src/queries/query-client.ts`
- `apps/desktop/src/queries/query-keys.ts`
- `apps/desktop/src/queries/query-keys.test.ts`
- `apps/desktop/src/queries/use-library-items.ts`
- `apps/desktop/src/queries/use-secure-image.ts`

### Tauri/Rust、集成测试与发布

- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/Cargo.lock`
- `apps/desktop/src-tauri/build.rs`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/src-tauri/src/main.rs`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/error.rs`
- `apps/desktop/src-tauri/src/commands/mod.rs`
- `apps/desktop/src-tauri/src/commands/health.rs`
- `apps/desktop/src-tauri/src/commands/credentials.rs`
- `apps/desktop/src-tauri/src/commands/player.rs`
- `apps/desktop/src-tauri/src/credentials/mod.rs`
- `apps/desktop/src-tauri/src/credentials/keyring_store.rs`
- `apps/desktop/src-tauri/src/storage.rs`
- `apps/desktop/src-tauri/migrations/0001_init.sql`
- `apps/desktop/src-tauri/src/mpv/mod.rs`
- `apps/desktop/src-tauri/src/mpv/process.rs`
- `apps/desktop/src-tauri/src/mpv/protocol.rs`
- `apps/desktop/src-tauri/src/mpv/session.rs`
- `apps/desktop/src-tauri/src/mpv/ipc/mod.rs`
- `apps/desktop/src-tauri/src/mpv/ipc/unix.rs`
- `apps/desktop/src-tauri/src/mpv/ipc/windows.rs`
- `apps/desktop/src-tauri/tests/credential_commands.rs`
- `apps/desktop/src-tauri/tests/mpv_session.rs`
- `apps/desktop/src-tauri/resources/mpv/mpv.lock.json`
- `apps/desktop/src-tauri/resources/third-party/mpv-LICENSE.txt`
- `apps/desktop/src-tauri/resources/third-party/ffmpeg-LICENSE.txt`
- `tests/fixtures/emby/authenticate.json`
- `tests/fixtures/emby/libraries.json`
- `tests/fixtures/emby/items.json`
- `tests/fixtures/emby/playback-info.json`
- `tests/fixtures/jellyfin/authenticate.json`
- `tests/fixtures/jellyfin/libraries.json`
- `tests/fixtures/jellyfin/items.json`
- `tests/fixtures/jellyfin/playback-info.json`
- `tests/fixtures/media/samples.lock.json`
- `tests/integration/package.json`
- `tests/integration/vitest.config.ts`
- `tests/integration/support/mock-media-server.ts`
- `tests/integration/support/fake-mpv.mjs`
- `tests/integration/line-failover.test.ts`
- `tests/integration/jellyfin-contract.test.ts`
- `tests/e2e/onboarding.spec.ts`
- `tests/e2e/browse-search-play.spec.ts`
- `tests/e2e/fixtures.ts`
- `scripts/check-boundaries.mjs`
- `scripts/check-sensitive-output.mjs`
- `scripts/fetch-mpv.mjs`
- `scripts/verify-mpv.mjs`
- `scripts/verify-mpv.test.mjs`
- `scripts/package-checksums.mjs`
- `scripts/smoke-packaged.mjs`
- `.github/workflows/quality.yml`
- `.github/workflows/package.yml`
- `docs/release/v0.1-acceptance.md`
- `docs/release/third-party-sources.md`

## Canonical Interfaces

后续任务只能扩展实现，不能悄悄改名或改变以下签名；确需改变时先修改本计划并重新检查所有消费者。

```ts
// packages/core/src/server/types.ts
export type ServerKind = 'emby' | 'jellyfin'

export interface ServerLine {
  id: string
  label: string
  baseUrl: string
  priority: number
  enabled: boolean
}

export interface ServerProfile {
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

export interface AppPreferences {
  deviceId: string | null
  activeServerId: string | null
  activeLibraryIdByServer: Readonly<Record<string, string>>
  sensitiveLineIds: readonly string[]
}
```

```ts
// packages/core/src/ports/*.ts
export interface HttpRequest {
  baseUrl: string
  path: `/${string}`
  method: 'GET' | 'POST' | 'DELETE'
  query?: Readonly<Record<string, string | number | boolean | undefined>>
  headers?: Readonly<Record<string, string>>
  body?: unknown
  signal?: AbortSignal
  timeoutMs: number
  responseType?: 'json' | 'bytes'
}

export interface HttpResponse<T> {
  status: number
  headers: Readonly<Record<string, string>>
  data: T
}

export interface HttpTransport {
  request<T>(request: HttpRequest): Promise<HttpResponse<T>>
}

export interface CredentialStore {
  set(credentialKey: string, token: string): Promise<void>
  get(credentialKey: string): Promise<string | null>
  delete(credentialKey: string): Promise<void>
}

export interface StoragePort {
  initialize(): Promise<void>
  listServerProfiles(): Promise<readonly ServerProfile[]>
  getServerProfile(profileId: string): Promise<ServerProfile | null>
  saveServerProfile(profile: ServerProfile): Promise<void>
  deleteServerProfile(profileId: string): Promise<void>
  reorderServerProfiles(profileIds: readonly string[]): Promise<void>
  loadPreferences(): Promise<AppPreferences>
  savePreferences(preferences: AppPreferences): Promise<void>
}

export type TimerHandle = ReturnType<typeof setTimeout>

export interface Clock {
  nowMs(): number
  setTimeout(callback: () => void, delayMs: number): TimerHandle
  clearTimeout(handle: TimerHandle): void
}

export interface Logger {
  debug(message: string, context?: Readonly<Record<string, unknown>>): void
  info(message: string, context?: Readonly<Record<string, unknown>>): void
  warn(message: string, context?: Readonly<Record<string, unknown>>): void
  error(message: string, context?: Readonly<Record<string, unknown>>): void
}
```

```ts
// packages/core/src/media/types.ts and media-server-adapter.ts
export interface Library {
  id: string
  name: string
  collectionType: string | null
}

export type MediaKind = 'movie' | 'series' | 'season' | 'episode'

export interface MediaItem {
  id: string
  kind: MediaKind
  name: string
  overview: string | null
  productionYear: number | null
  runtimeSeconds: number | null
  parentId: string | null
  seriesId: string | null
  indexNumber: number | null
  imageTag: string | null
  playbackPositionSeconds: number
}

export interface Page<T> {
  items: readonly T[]
  total: number
  startIndex: number
}

export interface ItemQuery {
  libraryId?: string
  parentId?: string
  ids?: readonly string[]
  kinds?: readonly MediaKind[]
  startIndex: number
  limit: number
}

export interface SearchQuery {
  term: string
  kinds?: readonly MediaKind[]
  startIndex: number
  limit: number
}

export interface LoginInput {
  baseUrl: string
  username: string
  password: string
  deviceId: string
  deviceName: 'LumaRoute'
  appVersion: string
  signal?: AbortSignal
}

export interface AuthSession {
  serverId: string
  serverName: string
  userId: string
  username: string
  accessToken: string
}

export interface RequestContext {
  profileId: string
  line: ServerLine
  userId: string
  accessToken: string
  signal?: AbortSignal
}

export interface MediaServerAdapter {
  authenticate(input: LoginInput): Promise<AuthSession>
  getLibraries(context: RequestContext): Promise<Library[]>
  getItems(query: ItemQuery, context: RequestContext): Promise<Page<MediaItem>>
  getContinueWatching(context: RequestContext): Promise<MediaItem[]>
  search(query: SearchQuery, context: RequestContext): Promise<Page<MediaItem>>
  getPlaybackPlan(itemId: string, context: RequestContext): Promise<PlaybackPlan>
  reportPlayback(event: PlaybackReport, context: RequestContext): Promise<void>
}
```

```ts
// packages/player/src/types.ts and player-engine.ts
export type PlaybackMethod = 'direct-play' | 'direct-stream'

export interface PlaybackPlan {
  itemId: string
  mediaSourceId: string
  playSessionId: string
  streamUrl: string
  requestHeaders: Readonly<Record<string, string>>
  container: string
  videoCodec: string
  audioCodec: string | null
  bitrate: number | null
  durationSeconds: number
  method: PlaybackMethod
  startPositionSeconds: number
}

export type PlayerEvent =
  | { type: 'started'; positionSeconds: number; durationSeconds: number }
  | { type: 'position'; positionSeconds: number; durationSeconds: number }
  | { type: 'paused'; positionSeconds: number; durationSeconds: number }
  | { type: 'resumed'; positionSeconds: number; durationSeconds: number }
  | { type: 'seeked'; positionSeconds: number; durationSeconds: number }
  | { type: 'ended'; positionSeconds: number; durationSeconds: number }
  | { type: 'stopped'; positionSeconds: number; durationSeconds: number }
  | { type: 'error'; code: 'PlayerUnavailable' | 'PlaybackFailed'; message: string }

export type Unsubscribe = () => void

export interface PlayerEngine {
  play(plan: PlaybackPlan): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  seek(positionSeconds: number): Promise<void>
  stop(): Promise<void>
  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe
}
```

```ts
// packages/core/src/playback/progress-reporter.ts
export type PlaybackReportType =
  | 'started'
  | 'progress'
  | 'paused'
  | 'resumed'
  | 'seeked'
  | 'stopped'

export interface PlaybackReport {
  type: PlaybackReportType
  itemId: string
  mediaSourceId: string
  playSessionId: string
  positionTicks: number
  isPaused: boolean
}
```

```ts
// packages/core/src/errors/app-error.ts
export type AppErrorCode =
  | 'NetworkUnavailable'
  | 'LineTimeout'
  | 'AuthenticationExpired'
  | 'ServerMismatch'
  | 'UnsupportedServerVersion'
  | 'MediaNotDirectPlayable'
  | 'PlayerUnavailable'
  | 'PlaybackFailed'
  | 'StorageFailure'

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
```

## Task 1: 可运行的跨层 Walking Skeleton

**可独立验收：** Vue 窗口显示 “LumaRoute ready”，TypeScript health service 和受限 Tauri `health_check` 命令均通过测试，工作区质量命令可从仓库根运行。

**Files:**
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `package.json`
- Create: `pnpm-lock.yaml` (generated by `pnpm`)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `vitest.workspace.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/system/health.ts`
- Test: `packages/core/src/system/health.test.ts`
- Create: `packages/player/package.json`
- Create: `packages/player/tsconfig.json`
- Create: `packages/player/vitest.config.ts`
- Create: `packages/player/src/index.ts`
- Create: `packages/player/src/types.ts`
- Create: `packages/player/src/player-engine.ts`
- Test: `packages/player/src/player-engine.test.ts`
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/tsconfig.node.json`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src/env.d.ts`
- Create: `apps/desktop/src/main.ts`
- Create: `apps/desktop/src/App.vue`
- Test: `apps/desktop/src/App.test.ts`
- Create: `apps/desktop/src/styles.css`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/Cargo.lock` (generated by `cargo`)
- Create: `apps/desktop/src-tauri/build.rs`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/capabilities/default.json`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/src/error.rs`
- Create: `apps/desktop/src-tauri/src/commands/mod.rs`
- Create: `apps/desktop/src-tauri/src/commands/health.rs`

**Interfaces:**
- Consumes: none.
- Produces: `healthCheck(): { status: 'ready'; version: string }`; Tauri command `health_check() -> Result<HealthStatus, NativeError>`; canonical `PlayerEngine`, `PlaybackPlan`, and `PlayerEvent` above.

- [x] **Step 1: Create workspace manifests and tool configuration**

```json
// package.json
{
  "name": "lumaroute",
  "private": true,
  "packageManager": "pnpm@10.15.0",
  "engines": { "node": ">=22.18.0" },
  "scripts": {
    "dev": "pnpm --filter @lumaroute/desktop tauri dev",
    "build": "pnpm -r build",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "pnpm -r typecheck",
    "test": "vitest run --config vitest.workspace.ts",
    "test:rust": "cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml",
    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm test:rust"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
  - tests/integration
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useDefineForClassFields": true,
    "skipLibCheck": true
  }
}
```

Run:

```bash
corepack enable
pnpm add -Dw typescript vite vitest @vitest/coverage-v8 eslint @eslint/js typescript-eslint eslint-plugin-vue vue-eslint-parser prettier
pnpm --filter @lumaroute/desktop add vue pinia vue-router @tauri-apps/api @tauri-apps/cli
pnpm --filter @lumaroute/desktop add -D @vitejs/plugin-vue @vue/test-utils happy-dom
```

Expected: `pnpm-lock.yaml` is created and every dependency is recorded with an exact resolved version.

- [x] **Step 2: Write failing core, player-contract, and Vue shell tests**

```ts
// packages/core/src/system/health.test.ts
import { describe, expect, it } from 'vitest'
import { healthCheck } from './health'

describe('healthCheck', () => {
  it('returns a ready status and semantic version', () => {
    expect(healthCheck()).toEqual({ status: 'ready', version: '0.1.0' })
  })
})
```

```ts
// packages/player/src/player-engine.test.ts
import { expectTypeOf, it } from 'vitest'
import type { PlayerEngine } from './player-engine'

it('publishes an implementation-independent player contract', () => {
  expectTypeOf<PlayerEngine['seek']>().parameters.toEqualTypeOf<[number]>()
  expectTypeOf<PlayerEngine['stop']>().returns.toEqualTypeOf<Promise<void>>()
})
```

```ts
// apps/desktop/src/App.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import App from './App.vue'

describe('App', () => {
  it('renders the cross-layer ready state', () => {
    expect(mount(App).get('[data-testid="ready"]').text()).toBe('LumaRoute ready')
  })
})
```

- [x] **Step 3: Run the tests to verify the red state**

Run: `pnpm test`

Expected: FAIL because `health.ts`, the player contracts, and `App.vue` do not exist.

- [x] **Step 4: Implement the minimal shared contracts and Vue shell**

```ts
// packages/core/src/system/health.ts
export interface AppHealth {
  status: 'ready'
  version: string
}

export function healthCheck(): AppHealth {
  return { status: 'ready', version: '0.1.0' }
}
```

```ts
// packages/player/src/player-engine.ts
import type { PlaybackPlan, PlayerEvent, Unsubscribe } from './types'

export interface PlayerEngine {
  play(plan: PlaybackPlan): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  seek(positionSeconds: number): Promise<void>
  stop(): Promise<void>
  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe
}
```

```vue
<!-- apps/desktop/src/App.vue -->
<template>
  <main>
    <h1>LumaRoute</h1>
    <p data-testid="ready">LumaRoute ready</p>
  </main>
</template>
```

```ts
// apps/desktop/src/main.ts
import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

createApp(App).mount('#app')
```

- [x] **Step 5: Add the allowlisted Rust health command and Tauri shell**

```rust
// apps/desktop/src-tauri/src/commands/health.rs
use serde::Serialize;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    pub status: &'static str,
    pub version: &'static str,
}

#[tauri::command]
pub fn health_check() -> Result<HealthStatus, crate::error::NativeError> {
    Ok(HealthStatus {
        status: "ready",
        version: "0.1.0",
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_ready() {
        assert_eq!(
            health_check().expect("health status"),
            HealthStatus { status: "ready", version: "0.1.0" }
        );
    }
}
```

```rust
// apps/desktop/src-tauri/src/lib.rs
mod commands;
mod error;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::health::health_check])
        .run(tauri::generate_context!())
        .expect("failed to run LumaRoute");
}
```

Run:

```bash
cd apps/desktop/src-tauri
cargo add tauri@2 serde --features serde/derive
cargo add thiserror
cd ../../..
```

Expected: `Cargo.lock` records exact Rust crate versions and `cargo check` succeeds.

- [x] **Step 6: Verify the green state and architecture baseline**

Run: `pnpm check`

Expected: all TypeScript/Vue tests pass, Rust health test passes, lint/typecheck report zero errors.

- [x] **Step 7: Launch the desktop shell**

Run: `pnpm dev`

Expected: a Tauri window opens and displays `LumaRoute ready`; terminal contains no panic or WebView console error.

- [ ] **Step 8: Commit the independently runnable skeleton**

```bash
git add .editorconfig .gitignore .nvmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs prettier.config.mjs vitest.workspace.ts packages apps/desktop
git commit -m "feat: establish runnable LumaRoute desktop skeleton"
```

## Task 2: 逻辑服务器与 SQLite 持久化纵切

**可独立验收：** `ServerProfile`/`ServerLine` 能以事务写入和重载，迁移可重复执行，SQLite 原始内容只包含 `credentialKey` 而不包含 Token/密码。

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/errors/app-error.ts`
- Create: `packages/core/src/server/types.ts`
- Create: `packages/core/src/ports/storage-port.ts`
- Create: `packages/core/src/server/server-catalog.ts`
- Test: `packages/core/src/server/server-catalog.test.ts`
- Create: `apps/desktop/src/platform/storage/sql-client.ts`
- Create: `apps/desktop/src/platform/storage/sqlite-storage.ts`
- Test: `apps/desktop/src/platform/storage/sqlite-storage.test.ts`
- Create: `apps/desktop/src-tauri/migrations/0001_init.sql`
- Create: `apps/desktop/src-tauri/src/storage.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `AppError` codes from Canonical Interfaces.
- Produces: canonical `ServerProfile`, `ServerLine`, `AppPreferences`, and `StoragePort`; `ServerCatalog.create(profile)`, `.update(profile)`, `.remove(profileId)`, `.reorder(profileIds)`.

- [x] **Step 1: Write the failing domain catalog tests**

```ts
// packages/core/src/server/server-catalog.test.ts
import { describe, expect, it, vi } from 'vitest'
import { ServerCatalog } from './server-catalog'
import type { StoragePort } from '../ports/storage-port'
import type { ServerProfile } from './types'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'jellyfin',
  serverId: 'server-a',
  userId: 'user-a',
  username: 'alice',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'line-lan',
  lines: [
    { id: 'line-lan', label: 'LAN', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
  ],
}

describe('ServerCatalog', () => {
  it('rejects a preferred line outside the profile', async () => {
    const storage = { saveServerProfile: vi.fn() } as unknown as StoragePort
    const catalog = new ServerCatalog(storage)
    await expect(
      catalog.create({ ...profile, preferredLineId: 'missing' }),
    ).rejects.toMatchObject({ code: 'StorageFailure' })
    expect(storage.saveServerProfile).not.toHaveBeenCalled()
  })

  it('persists a valid profile', async () => {
    const storage = { saveServerProfile: vi.fn() } as unknown as StoragePort
    await new ServerCatalog(storage).create(profile)
    expect(storage.saveServerProfile).toHaveBeenCalledWith(profile)
  })
})
```

- [x] **Step 2: Run the catalog test to verify it fails**

Run: `pnpm vitest run packages/core/src/server/server-catalog.test.ts`

Expected: FAIL with missing `ServerCatalog`, `StoragePort`, and server model modules.

- [x] **Step 3: Implement the domain model, storage port, and catalog validation**

```ts
// packages/core/src/server/server-catalog.ts
import { AppError } from '../errors/app-error'
import type { StoragePort } from '../ports/storage-port'
import type { ServerProfile } from './types'

export class ServerCatalog {
  constructor(private readonly storage: StoragePort) {}

  async create(profile: ServerProfile): Promise<void> {
    this.assertValid(profile)
    await this.storage.saveServerProfile(profile)
  }

  async update(profile: ServerProfile): Promise<void> {
    this.assertValid(profile)
    await this.storage.saveServerProfile(profile)
  }

  remove(profileId: string): Promise<void> {
    return this.storage.deleteServerProfile(profileId)
  }

  reorder(profileIds: readonly string[]): Promise<void> {
    return this.storage.reorderServerProfiles(profileIds)
  }

  private assertValid(profile: ServerProfile): void {
    const ids = new Set(profile.lines.map((line) => line.id))
    if (ids.size !== profile.lines.length || !ids.has(profile.preferredLineId)) {
      throw new AppError('StorageFailure', 'Server profile contains invalid line references')
    }
    for (const line of profile.lines) {
      const url = new URL(line.baseUrl)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new AppError('StorageFailure', 'Server line must be an HTTP(S) origin without credentials')
      }
    }
  }
}
```

```ts
// packages/core/src/ports/storage-port.ts
import type { AppPreferences, ServerProfile } from '../server/types'

export interface StoragePort {
  initialize(): Promise<void>
  listServerProfiles(): Promise<readonly ServerProfile[]>
  getServerProfile(profileId: string): Promise<ServerProfile | null>
  saveServerProfile(profile: ServerProfile): Promise<void>
  deleteServerProfile(profileId: string): Promise<void>
  reorderServerProfiles(profileIds: readonly string[]): Promise<void>
  loadPreferences(): Promise<AppPreferences>
  savePreferences(preferences: AppPreferences): Promise<void>
}
```

- [x] **Step 4: Write the failing SQLite adapter tests**

```ts
// apps/desktop/src/platform/storage/sqlite-storage.test.ts
import { describe, expect, it } from 'vitest'
import { createMemorySqlClient } from './sql-client'
import { SqliteStorage } from './sqlite-storage'

describe('SqliteStorage', () => {
  it('round-trips profiles and lines transactionally', async () => {
    const client = createMemorySqlClient()
    const storage = new SqliteStorage(client)
    await storage.initialize()
    await storage.saveServerProfile({
      id: 'p1',
      name: 'Home',
      kind: 'emby',
      serverId: 's1',
      userId: 'u1',
      username: 'alice',
      credentialKey: 'lumaroute/p1',
      preferredLineId: 'l1',
      lines: [{ id: 'l1', label: 'LAN', baseUrl: 'http://nas:8096', priority: 0, enabled: true }],
    })
    expect(await storage.getServerProfile('p1')).toMatchObject({
      serverId: 's1',
      credentialKey: 'lumaroute/p1',
      lines: [{ id: 'l1', priority: 0 }],
    })
  })

  it('never writes credential values', async () => {
    const client = createMemorySqlClient()
    const storage = new SqliteStorage(client)
    await storage.initialize()
    expect(JSON.stringify(client.dump())).not.toMatch(/token|password|accessToken/i)
  })
})
```

- [x] **Step 5: Run the storage tests to verify they fail**

Run: `pnpm vitest run apps/desktop/src/platform/storage/sqlite-storage.test.ts`

Expected: FAIL because the SQL client and `SqliteStorage` are missing.

- [x] **Step 6: Add the versioned schema and parameterized storage adapter**

```sql
-- apps/desktop/src-tauri/migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS server_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('emby', 'jellyfin')),
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  credential_key TEXT NOT NULL UNIQUE,
  preferred_line_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_lines (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES server_profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  priority INTEGER NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  UNIQUE(profile_id, base_url)
);

CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL
);

PRAGMA user_version = 1;
```

```ts
// apps/desktop/src/platform/storage/sqlite-storage.ts
import type { AppPreferences, ServerLine, ServerProfile, StoragePort } from '@lumaroute/core'
import type { SqlClient } from './sql-client'

const DEFAULT_PREFERENCES: AppPreferences = {
  deviceId: null,
  activeServerId: null,
  activeLibraryIdByServer: {},
  sensitiveLineIds: [],
}

export class SqliteStorage implements StoragePort {
  constructor(private readonly db: SqlClient) {}

  async initialize(): Promise<void> {
    await this.db.migrate()
  }

  async saveServerProfile(profile: ServerProfile): Promise<void> {
    await this.db.transaction(async (tx) => {
      const sortOrder = await tx.scalar<number>(
        'SELECT COALESCE(MAX(sort_order) + 1, 0) FROM server_profiles WHERE id <> ?',
        [profile.id],
      )
      await tx.execute(
        `INSERT INTO server_profiles
          (id,name,kind,server_id,user_id,username,credential_key,preferred_line_id,sort_order)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,kind=excluded.kind,server_id=excluded.server_id,
          user_id=excluded.user_id,username=excluded.username,
          credential_key=excluded.credential_key,preferred_line_id=excluded.preferred_line_id`,
        [profile.id, profile.name, profile.kind, profile.serverId, profile.userId,
          profile.username, profile.credentialKey, profile.preferredLineId, sortOrder],
      )
      await tx.execute('DELETE FROM server_lines WHERE profile_id = ?', [profile.id])
      for (const line of profile.lines) {
        await tx.execute(
          `INSERT INTO server_lines
            (id,profile_id,label,base_url,priority,enabled) VALUES (?,?,?,?,?,?)`,
          [line.id, profile.id, line.label, line.baseUrl, line.priority, line.enabled ? 1 : 0],
        )
      }
    })
  }

  async getServerProfile(profileId: string): Promise<ServerProfile | null> {
    const profile = await this.db.first<Record<string, unknown>>(
      'SELECT * FROM server_profiles WHERE id = ?',
      [profileId],
    )
    if (!profile) return null
    const lines = await this.db.all<Record<string, unknown>>(
      'SELECT * FROM server_lines WHERE profile_id = ? ORDER BY priority, id',
      [profileId],
    )
    return this.mapProfile(profile, lines)
  }

  async listServerProfiles(): Promise<readonly ServerProfile[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      'SELECT id FROM server_profiles ORDER BY sort_order, id',
    )
    return (await Promise.all(rows.map((row) => this.getServerProfile(String(row.id)))))
      .filter((profile): profile is ServerProfile => profile !== null)
  }

  async deleteServerProfile(profileId: string): Promise<void> {
    await this.db.execute('DELETE FROM server_profiles WHERE id = ?', [profileId])
  }

  async reorderServerProfiles(profileIds: readonly string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [sortOrder, profileId] of profileIds.entries()) {
        await tx.execute('UPDATE server_profiles SET sort_order = ? WHERE id = ?', [sortOrder, profileId])
      }
    })
  }

  async loadPreferences(): Promise<AppPreferences> {
    const row = await this.db.first<{ value_json: string }>(
      "SELECT value_json FROM preferences WHERE key = 'app'",
    )
    return row ? (JSON.parse(row.value_json) as AppPreferences) : DEFAULT_PREFERENCES
  }

  async savePreferences(preferences: AppPreferences): Promise<void> {
    await this.db.execute(
      `INSERT INTO preferences(key,value_json) VALUES('app',?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,
      [JSON.stringify(preferences)],
    )
  }

  private mapProfile(row: Record<string, unknown>, lineRows: Record<string, unknown>[]): ServerProfile {
    const lines: ServerLine[] = lineRows.map((line) => ({
      id: String(line.id),
      label: String(line.label),
      baseUrl: String(line.base_url),
      priority: Number(line.priority),
      enabled: Number(line.enabled) === 1,
    }))
    return {
      id: String(row.id),
      name: String(row.name),
      kind: row.kind as ServerProfile['kind'],
      serverId: String(row.server_id),
      userId: String(row.user_id),
      username: String(row.username),
      credentialKey: String(row.credential_key),
      preferredLineId: String(row.preferred_line_id),
      lines,
    }
  }
}
```

- [x] **Step 7: Register SQLite migrations in the thin Rust layer**

```rust
// apps/desktop/src-tauri/src/storage.rs
use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initialize profiles lines and preferences",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }]
}
```

```rust
// registration added to apps/desktop/src-tauri/src/lib.rs
.plugin(
    tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:lumaroute.db", storage::migrations())
        .build(),
)
```

Run:

```bash
pnpm --filter @lumaroute/desktop add @tauri-apps/plugin-sql
cd apps/desktop/src-tauri
cargo add tauri-plugin-sql@2 --features sqlite
cd ../../..
```

Expected: the plugin compiles and only exposes the application database capability.

- [x] **Step 8: Verify persistence and migrations**

Run:

```bash
pnpm vitest run packages/core/src/server/server-catalog.test.ts apps/desktop/src/platform/storage/sqlite-storage.test.ts
pnpm typecheck
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: 4 scoped tests pass; migration registration compiles; typecheck reports zero errors.

- [ ] **Step 9: Commit the storage slice**

```bash
git add packages/core/src/errors packages/core/src/server packages/core/src/ports/storage-port.ts apps/desktop/src/platform/storage apps/desktop/src-tauri/migrations apps/desktop/src-tauri/src/storage.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: persist logical servers and lines"
```

## Task 3: 安全登录与首台服务器 Onboarding

**可独立验收：** 用户选择 Emby/Jellyfin、输入主线路与账号后完成认证；稳定设备 ID 被保留，密码被丢弃，Token 只写系统安全存储，Profile 只写 `credentialKey`。

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/ports/http-transport.ts`
- Create: `packages/core/src/ports/credential-store.ts`
- Create: `packages/core/src/auth/types.ts`
- Create: `packages/core/src/auth/authentication-adapter.ts`
- Create: `packages/core/src/auth/login-service.ts`
- Test: `packages/core/src/auth/login-service.test.ts`
- Create: `packages/core/src/adapters/emby/emby-dto.ts`
- Create: `packages/core/src/adapters/emby/emby-mapper.ts`
- Create: `packages/core/src/adapters/emby/emby-adapter.ts`
- Test: `packages/core/src/adapters/emby/emby-adapter.test.ts`
- Create: `packages/core/src/adapters/jellyfin/jellyfin-dto.ts`
- Create: `packages/core/src/adapters/jellyfin/jellyfin-mapper.ts`
- Create: `packages/core/src/adapters/jellyfin/jellyfin-adapter.ts`
- Test: `packages/core/src/adapters/jellyfin/jellyfin-adapter.test.ts`
- Create: `tests/fixtures/emby/authenticate.json`
- Create: `tests/fixtures/jellyfin/authenticate.json`
- Create: `apps/desktop/src/platform/http/origin-policy.ts`
- Test: `apps/desktop/src/platform/http/origin-policy.test.ts`
- Create: `apps/desktop/src/platform/http/tauri-http-transport.ts`
- Test: `apps/desktop/src/platform/http/tauri-http-transport.test.ts`
- Create: `apps/desktop/src/platform/credentials/tauri-credential-store.ts`
- Test: `apps/desktop/src/platform/credentials/tauri-credential-store.test.ts`
- Create: `apps/desktop/src/platform/device/device-identity.ts`
- Test: `apps/desktop/src/platform/device/device-identity.test.ts`
- Create: `apps/desktop/src-tauri/src/commands/credentials.rs`
- Create: `apps/desktop/src-tauri/src/credentials/mod.rs`
- Create: `apps/desktop/src-tauri/src/credentials/keyring_store.rs`
- Test: `apps/desktop/src-tauri/tests/credential_commands.rs`
- Create: `apps/desktop/src/stores/server-store.ts`
- Test: `apps/desktop/src/stores/server-store.test.ts`
- Create: `apps/desktop/src/views/OnboardingView.vue`
- Test: `apps/desktop/src/views/OnboardingView.test.ts`
- Create: `apps/desktop/src/router/index.ts`
- Create: `apps/desktop/src/composition/create-services.ts`
- Create: `apps/desktop/src/composition/service-types.ts`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/App.vue`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `HttpTransport`, `StoragePort`, `CredentialStore`, `ServerProfile`, `ServerLine`, `AppError`.
- Produces: `AuthenticationAdapter.authenticate(input: LoginInput): Promise<AuthSession>`; `LoginService.addServer(input: AddServerInput): Promise<{ profile: ServerProfile; serverName: string }>`; native commands `credential_set`, `credential_get`, `credential_delete`.

- [x] **Step 1: Write failing login transaction tests**

```ts
// packages/core/src/auth/login-service.test.ts
import { describe, expect, it, vi } from 'vitest'
import { LoginService } from './login-service'

describe('LoginService', () => {
  it('stores only the credential key in the profile', async () => {
    const adapter = {
      authenticate: vi.fn().mockResolvedValue({
        serverId: 'server-a',
        serverName: 'Living Room',
        userId: 'user-a',
        username: 'alice',
        accessToken: 'secret-token',
      }),
    }
    const credentials = { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
    const storage = { saveServerProfile: vi.fn() }
    const ids = vi.fn().mockReturnValueOnce('profile-1').mockReturnValueOnce('line-1')
    const service = new LoginService(
      () => adapter,
      storage as never,
      credentials,
      ids,
    )

    const result = await service.addServer({
      name: 'Home',
      kind: 'jellyfin',
      baseUrl: 'https://media.example.com',
      username: 'alice',
      password: 'password-value',
      deviceId: 'device-1',
      appVersion: '0.1.0',
    })

    expect(credentials.set).toHaveBeenCalledWith('lumaroute/profile-1', 'secret-token')
    expect(storage.saveServerProfile).toHaveBeenCalledWith(result.profile)
    expect(result.serverName).toBe('Living Room')
    expect(JSON.stringify(result.profile)).not.toContain('secret-token')
    expect(JSON.stringify(result.profile)).not.toContain('password-value')
  })

  it('removes the credential when profile persistence fails', async () => {
    const adapter = { authenticate: vi.fn().mockResolvedValue({
      serverId: 's', serverName: 'S', userId: 'u', username: 'a', accessToken: 'token',
    }) }
    const credentials = { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
    const storage = { saveServerProfile: vi.fn().mockRejectedValue(new Error('disk full')) }
    const ids = vi.fn().mockReturnValueOnce('p').mockReturnValueOnce('l')
    const service = new LoginService(() => adapter, storage as never, credentials, ids)

    await expect(service.addServer({
      name: 'S', kind: 'emby', baseUrl: 'http://nas:8096',
      username: 'a', password: 'p', deviceId: 'd', appVersion: '0.1.0',
    })).rejects.toMatchObject({ code: 'StorageFailure' })
    expect(credentials.delete).toHaveBeenCalledWith('lumaroute/p')
  })
})
```

- [x] **Step 2: Run login tests to verify the red state**

Run: `pnpm vitest run packages/core/src/auth/login-service.test.ts`

Expected: FAIL because `LoginService` and authentication contracts do not exist.

- [x] **Step 3: Implement the login transaction**

```ts
// packages/core/src/auth/login-service.ts
import { AppError } from '../errors/app-error'
import type { CredentialStore } from '../ports/credential-store'
import type { StoragePort } from '../ports/storage-port'
import type { ServerKind, ServerProfile } from '../server/types'
import type { AuthenticationAdapter } from './authentication-adapter'

export interface AddServerInput {
  name: string
  kind: ServerKind
  baseUrl: string
  username: string
  password: string
  deviceId: string
  appVersion: string
}

export class LoginService {
  constructor(
    private readonly adapterFor: (kind: ServerKind) => AuthenticationAdapter,
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
    private readonly nextId: () => string,
  ) {}

  async addServer(
    input: AddServerInput,
  ): Promise<{ profile: ServerProfile; serverName: string }> {
    const profileId = this.nextId()
    const lineId = this.nextId()
    const session = await this.adapterFor(input.kind).authenticate({
      baseUrl: normalizeBaseUrl(input.baseUrl),
      username: input.username,
      password: input.password,
      deviceId: input.deviceId,
      deviceName: 'LumaRoute',
      appVersion: input.appVersion,
    })
    const credentialKey = `lumaroute/${profileId}`
    const profile: ServerProfile = {
      id: profileId,
      name: input.name,
      kind: input.kind,
      serverId: session.serverId,
      userId: session.userId,
      username: session.username,
      credentialKey,
      preferredLineId: lineId,
      lines: [{
        id: lineId,
        label: 'Primary',
        baseUrl: normalizeBaseUrl(input.baseUrl),
        priority: 0,
        enabled: true,
      }],
    }
    await this.credentials.set(credentialKey, session.accessToken)
    try {
      await this.storage.saveServerProfile(profile)
      return { profile, serverName: session.serverName }
    } catch (cause) {
      await this.credentials.delete(credentialKey)
      throw new AppError('StorageFailure', 'Unable to persist authenticated server', cause)
    }
  }
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AppError('NetworkUnavailable', 'Server address must be an HTTP(S) URL without credentials')
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}
```

- [x] **Step 4: Write failing Emby and Jellyfin authentication contract tests**

```ts
// shared shape used in each adapter test
it('authenticates with device identity and maps the session', async () => {
  transport.request
    .mockResolvedValueOnce({ status: 200, headers: {}, data: { Id: 'server-a', ServerName: 'Home' } })
    .mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { AccessToken: 'token-a', ServerId: 'server-a', User: { Id: 'user-a', Name: 'alice' } },
    })

  await expect(adapter.authenticate({
    baseUrl: 'https://media.example.com',
    username: 'alice',
    password: 'secret',
    deviceId: 'device-a',
    deviceName: 'LumaRoute',
    appVersion: '0.1.0',
  })).resolves.toEqual({
    serverId: 'server-a',
    serverName: 'Home',
    userId: 'user-a',
    username: 'alice',
    accessToken: 'token-a',
  })
  expect(transport.request.mock.calls[1][0].path).toBe('/Users/AuthenticateByName')
})
```

Run: `pnpm vitest run packages/core/src/adapters/{emby,jellyfin}/*.test.ts`

Expected: FAIL because both adapters are absent.

- [x] **Step 5: Implement adapter authentication without logging credentials**

```ts
// packages/core/src/adapters/jellyfin/jellyfin-adapter.ts
export class JellyfinAdapter implements AuthenticationAdapter {
  constructor(private readonly http: HttpTransport) {}

  async authenticate(input: LoginInput): Promise<AuthSession> {
    const authorization = `MediaBrowser Client="${input.deviceName}", Device="${input.deviceName}", DeviceId="${input.deviceId}", Version="${input.appVersion}"`
    const info = await this.http.request<PublicSystemInfoDto>({
      baseUrl: input.baseUrl,
      path: '/System/Info/Public',
      method: 'GET',
      timeoutMs: 8_000,
    })
    const auth = await this.http.request<AuthenticateResponseDto>({
      baseUrl: input.baseUrl,
      path: '/Users/AuthenticateByName',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Emby-Authorization': authorization },
      body: { Username: input.username, Pw: input.password },
      signal: input.signal,
      timeoutMs: 10_000,
    })
    return {
      serverId: auth.data.ServerId,
      serverName: info.data.ServerName,
      userId: auth.data.User.Id,
      username: auth.data.User.Name,
      accessToken: auth.data.AccessToken,
    }
  }
}
```

```ts
// packages/core/src/adapters/emby/emby-adapter.ts
export class EmbyAdapter implements AuthenticationAdapter {
  constructor(private readonly http: HttpTransport) {}

  async authenticate(input: LoginInput): Promise<AuthSession> {
    const authorization = `MediaBrowser Client="${input.deviceName}", Device="${input.deviceName}", DeviceId="${input.deviceId}", Version="${input.appVersion}"`
    const info = await this.http.request<EmbyPublicSystemInfoDto>({
      baseUrl: input.baseUrl,
      path: '/System/Info/Public',
      method: 'GET',
      signal: input.signal,
      timeoutMs: 8_000,
    })
    const auth = await this.http.request<EmbyAuthenticateResponseDto>({
      baseUrl: input.baseUrl,
      path: '/Users/AuthenticateByName',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Emby-Authorization': authorization },
      body: { Username: input.username, Pw: input.password },
      signal: input.signal,
      timeoutMs: 10_000,
    })
    return {
      serverId: auth.data.ServerId,
      serverName: info.data.ServerName,
      userId: auth.data.User.Id,
      username: auth.data.User.Name,
      accessToken: auth.data.AccessToken,
    }
  }
}
```

Keep `Emby*Dto` and `Jellyfin*Dto` declarations in their provider directories even where wire fields currently match.

- [x] **Step 6: Write failing origin-policy, redirect, and client identity tests**

```ts
// apps/desktop/src/platform/http/origin-policy.test.ts
it('allows saved origins and one scoped onboarding origin only', async () => {
  const policy = new OriginPolicy(() => ['https://saved.example'])
  expect(() => policy.assertAllowed('https://saved.example')).not.toThrow()
  expect(() => policy.assertAllowed('https://other.example')).toThrow()
  await policy.withEphemeralOrigin('http://nas:8096', async () => {
    expect(() => policy.assertAllowed('http://nas:8096')).not.toThrow()
  })
  expect(() => policy.assertAllowed('http://nas:8096')).toThrow()
})
```

```ts
// apps/desktop/src/platform/http/tauri-http-transport.test.ts
it('rejects a cross-origin redirect', async () => {
  fetchMock.mockResolvedValue(new Response(null, {
    status: 302,
    headers: { location: 'https://attacker.example/collect' },
  }))
  await expect(transport.request({
    baseUrl: 'https://saved.example',
    path: '/System/Info',
    method: 'GET',
    timeoutMs: 1_000,
  })).rejects.toMatchObject({ code: 'NetworkUnavailable' })
})

it('identifies native requests with a browser-compatible LumaRoute user agent', async () => {
  fetchMock.mockResolvedValue(new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  await transport.request({
    baseUrl: 'https://saved.example',
    path: '/System/Info/Public',
    method: 'GET',
    timeoutMs: 1_000,
  })
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit
  expect(new Headers(init.headers).get('user-agent')).toBe(
    'Mozilla/5.0 (compatible; LumaRoute/0.1.0)',
  )
})
```

Run: `pnpm vitest run apps/desktop/src/platform/http/*.test.ts`

Expected: FAIL because policy and transport are missing.

- [x] **Step 7: Implement exact-origin allowlisting, browser-compatible client identity, and manual redirects**

```ts
// apps/desktop/src/platform/http/origin-policy.ts
export class OriginPolicy {
  private readonly ephemeral = new Map<string, number>()

  constructor(private readonly savedBaseUrls: () => readonly string[]) {}

  assertAllowed(baseUrl: string): void {
    const normalized = normalizeBaseUrl(baseUrl)
    const saved = this.savedBaseUrls().map(normalizeBaseUrl)
    if (!saved.includes(normalized) && !this.ephemeral.has(normalized)) {
      throw new Error('HTTP base URL is not an approved server line')
    }
  }

  async withEphemeralOrigin<T>(baseUrl: string, operation: () => Promise<T>): Promise<T> {
    const normalized = normalizeBaseUrl(baseUrl)
    this.ephemeral.set(normalized, (this.ephemeral.get(normalized) ?? 0) + 1)
    try {
      return await operation()
    } finally {
      const remaining = (this.ephemeral.get(normalized) ?? 1) - 1
      if (remaining === 0) this.ephemeral.delete(normalized)
      else this.ephemeral.set(normalized, remaining)
    }
  }
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}
```

```ts
// apps/desktop/src/platform/http/tauri-http-transport.ts
const LUMAROUTE_USER_AGENT = 'Mozilla/5.0 (compatible; LumaRoute/0.1.0)'

export class TauriHttpTransport implements HttpTransport {
  constructor(
    private readonly policy: OriginPolicy,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    this.policy.assertAllowed(request.baseUrl)
    const url = buildUrl(request)
    const response = await this.fetchImpl(url, {
      method: request.method,
      headers: {
        'User-Agent': LUMAROUTE_USER_AGENT,
        ...request.headers,
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      redirect: 'manual',
      signal: AbortSignal.any([
        request.signal ?? new AbortController().signal,
        AbortSignal.timeout(request.timeoutMs),
      ]),
    })
    if (response.status >= 300 && response.status < 400) {
      throw new AppError('NetworkUnavailable', 'Cross-origin redirects are disabled')
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: response.status === 204 ? (undefined as T) : (await response.json()) as T,
    }
  }
}

function buildUrl(request: HttpRequest): URL {
  const url = new URL(
    `${request.baseUrl.replace(/\/+$/, '')}/${request.path.replace(/^\/+/, '')}`,
  )
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url
}
```

Run:

```bash
pnpm --filter @lumaroute/desktop add @tauri-apps/plugin-http
cd apps/desktop/src-tauri
cargo add tauri-plugin-http@2
cd ../../..
```

Expected: JavaScript/Rust plugin versions are locked and `lib.rs` registers `tauri_plugin_http::init()`.

- [x] **Step 8: Write failing native credential tests**

```rust
// apps/desktop/src-tauri/tests/credential_commands.rs
#[test]
fn credential_keys_are_namespaced_and_values_are_not_debuggable() {
    let input = lumaroute::commands::credentials::CredentialInput::new(
        "lumaroute/profile-1".into(),
        "secret-token".into(),
    ).expect("valid input");
    assert_eq!(input.key(), "lumaroute/profile-1");
    assert!(!format!("{input:?}").contains("secret-token"));
}
```

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml credential`

Expected: FAIL because credential commands and keyring store do not exist.

- [x] **Step 9: Implement system-keyring commands with redacted values**

```rust
// apps/desktop/src-tauri/src/commands/credentials.rs
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialInput {
    credential_key: String,
    token: String,
}

impl CredentialInput {
    pub fn new(credential_key: String, token: String) -> Result<Self, crate::error::NativeError> {
        validate_key(&credential_key)?;
        Ok(Self { credential_key, token })
    }

    pub fn key(&self) -> &str {
        &self.credential_key
    }
}

impl std::fmt::Debug for CredentialInput {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CredentialInput")
            .field("credential_key", &self.credential_key)
            .field("token", &"[REDACTED]")
            .finish()
    }
}

#[tauri::command]
pub async fn credential_set(
    state: tauri::State<'_, crate::credentials::CredentialState>,
    input: CredentialInput,
) -> Result<(), crate::error::NativeError> {
    validate_key(&input.credential_key)?;
    state.store
        .set(&input.credential_key, secrecy::SecretString::from(input.token))
        .await
}

#[tauri::command]
pub async fn credential_get(
    state: tauri::State<'_, crate::credentials::CredentialState>,
    credential_key: String,
) -> Result<Option<String>, crate::error::NativeError> {
    use secrecy::ExposeSecret;
    validate_key(&credential_key)?;
    Ok(state.store.get(&credential_key).await?
        .map(|value| value.expose_secret().to_owned()))
}

#[tauri::command]
pub async fn credential_delete(
    state: tauri::State<'_, crate::credentials::CredentialState>,
    credential_key: String,
) -> Result<(), crate::error::NativeError> {
    validate_key(&credential_key)?;
    state.store.delete(&credential_key).await
}

fn validate_key(key: &str) -> Result<(), crate::error::NativeError> {
    if key.starts_with("lumaroute/") && key.len() > "lumaroute/".len() {
        Ok(())
    } else {
        Err(crate::error::NativeError::invalid_input("invalid credential key"))
    }
}
```

Use Rust `keyring` behind a `CredentialBackend` trait so tests use an in-memory backend; configure service name `io.github.lumaroute.desktop`, reject keys not prefixed `lumaroute/`, and expose only the three commands above.

Run:

```bash
cd apps/desktop/src-tauri
cargo add keyring secrecy async-trait
cd ../../..
```

Expected: keyring backend compiles on the current platform and tests never print secret values.

- [x] **Step 10: Write failing onboarding component test**

```ts
// apps/desktop/src/views/OnboardingView.test.ts
it('submits the selected server kind and clears the password field', async () => {
  const addServer = vi.fn().mockResolvedValue({ id: 'profile-1' })
  const wrapper = mount(OnboardingView, { props: { addServer } })
  await wrapper.get('[name="kind"]').setValue('jellyfin')
  await wrapper.get('[name="name"]').setValue('Home')
  await wrapper.get('[name="baseUrl"]').setValue('https://media.example.com')
  await wrapper.get('[name="username"]').setValue('alice')
  await wrapper.get('[name="password"]').setValue('secret')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(addServer).toHaveBeenCalledWith(expect.objectContaining({ kind: 'jellyfin' }))
  expect((wrapper.get('[name="password"]').element as HTMLInputElement).value).toBe('')
  expect(wrapper.text()).toContain('Home')
})
```

Run: `pnpm vitest run apps/desktop/src/views/OnboardingView.test.ts`

Expected: FAIL because the onboarding view and server store are missing.

- [x] **Step 11: Implement onboarding, stable device ID, and composition**

```ts
// apps/desktop/src/stores/server-store.ts
export const useServerStore = defineStore('servers', () => {
  const profiles = ref<readonly ServerProfile[]>([])
  const onboardingResult = ref<{ serverName: string; serverId: string } | null>(null)

  type OnboardingInput = Omit<AddServerInput, 'deviceId' | 'appVersion'>

  async function addServer(input: OnboardingInput): Promise<void> {
    const services = injectServices()
    const deviceId = await services.deviceIdentity.getOrCreate()
    const result = await services.originPolicy.withEphemeralOrigin(input.baseUrl, () =>
      services.login.addServer({ ...input, deviceId, appVersion: '0.1.0' }),
    )
    profiles.value = await services.storage.listServerProfiles()
    onboardingResult.value = {
      serverName: result.serverName,
      serverId: result.profile.serverId,
    }
  }

  return { profiles, onboardingResult, addServer }
})
```

```ts
// apps/desktop/src/platform/device/device-identity.ts
export class DeviceIdentity {
  constructor(private readonly storage: StoragePort) {}

  async getOrCreate(): Promise<string> {
    const preferences = await this.storage.loadPreferences()
    if (preferences.deviceId) return preferences.deviceId
    const deviceId = crypto.randomUUID()
    await this.storage.savePreferences({ ...preferences, deviceId })
    return deviceId
  }
}
```

```ts
// apps/desktop/src/platform/device/device-identity.test.ts
it('creates one UUID and reuses it across launches', async () => {
  storage.loadPreferences
    .mockResolvedValueOnce({ ...defaultPreferences, deviceId: null })
    .mockResolvedValueOnce({ ...defaultPreferences, deviceId: 'device-stable' })
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('device-stable')
  const identity = new DeviceIdentity(storage)
  expect(await identity.getOrCreate()).toBe('device-stable')
  expect(await identity.getOrCreate()).toBe('device-stable')
  expect(storage.savePreferences).toHaveBeenCalledTimes(1)
})
```

```vue
<!-- essential form in apps/desktop/src/views/OnboardingView.vue -->
<form @submit.prevent="submit">
  <select v-model="form.kind" name="kind">
    <option value="emby">Emby</option>
    <option value="jellyfin">Jellyfin</option>
  </select>
  <input v-model.trim="form.name" name="name" required />
  <input v-model.trim="form.baseUrl" name="baseUrl" type="url" required />
  <input v-model.trim="form.username" name="username" autocomplete="username" required />
  <input v-model="form.password" name="password" type="password" autocomplete="current-password" required />
  <button type="submit" :disabled="submitting">Connect</button>
</form>
<p v-if="result">{{ result.serverName }} · {{ result.serverId }}</p>
```

Do not include the password in Pinia state, devtools snapshots, errors, or analytics.

- [x] **Step 12: Verify the complete onboarding slice**

Run:

```bash
pnpm vitest run packages/core/src/auth apps/desktop/src/platform/http apps/desktop/src/platform/credentials apps/desktop/src/platform/device apps/desktop/src/views/OnboardingView.test.ts
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml credential
pnpm typecheck
```

Expected: authentication mapping tests pass for Emby and Jellyfin; origin and credential tests pass; onboarding test passes; typecheck reports zero errors.

- [ ] **Step 13: Commit secure onboarding**

```bash
git add packages/core/src/auth packages/core/src/adapters packages/core/src/ports/http-transport.ts packages/core/src/ports/credential-store.ts tests/fixtures apps/desktop/src/platform/http apps/desktop/src/platform/credentials apps/desktop/src/platform/device apps/desktop/src/stores/server-store.ts apps/desktop/src/views/OnboardingView.vue apps/desktop/src/views/OnboardingView.test.ts apps/desktop/src/router apps/desktop/src/composition apps/desktop/src/main.ts apps/desktop/src/App.vue apps/desktop/src-tauri/src/commands apps/desktop/src-tauri/src/credentials apps/desktop/src-tauri/tests/credential_commands.rs apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock
git commit -m "feat: add secure Emby and Jellyfin onboarding"
```

## Task 4: ServerId 校验与确定性线路故障转移

**可独立验收：** 用户添加备用线路时先比对 `ServerId`；主线路超时或 `503` 后按顺序使用备用线路，`401` 不切线，成功线路在应用会话内粘附，手动选择立即覆盖。

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/server/line-order.ts`
- Test: `packages/core/src/server/line-order.test.ts`
- Create: `packages/core/src/server/route-executor.ts`
- Test: `packages/core/src/server/route-executor.test.ts`
- Create: `packages/core/src/server/line-service.ts`
- Test: `packages/core/src/server/line-service.test.ts`
- Create: `apps/desktop/src/components/LineEditor.vue`
- Create: `apps/desktop/src/components/LineStatus.vue`
- Modify: `apps/desktop/src/views/ServerSettingsView.vue`
- Test: `apps/desktop/src/views/ServerSettingsView.test.ts`
- Modify: `packages/core/src/adapters/emby/emby-adapter.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-adapter.ts`
- Modify: `apps/desktop/src/stores/server-store.ts`

**Interfaces:**
- Consumes: `ServerProfile`, `ServerLine`, `AuthenticationAdapter.getServerIdentity(baseUrl, accessToken, signal): Promise<{ serverId: string; serverName: string }>`; `StoragePort`; `CredentialStore`.
- Produces: `orderLines(profile, stickyLineId): readonly ServerLine[]`; `RouteExecutor.execute<T>(profile, operation, signal?): Promise<{ value: T; lineId: string }>`; `RouteExecutor.markManualSelection(profileId, lineId): void`; `LineService.addLine(profileId, draft): Promise<ServerProfile>`.

- [x] **Step 1: Write failing order and retry-classification tests**

```ts
// packages/core/src/server/line-order.test.ts
it('orders sticky, preferred, then remaining enabled lines by priority', () => {
  expect(orderLines(profile, 'backup-2').map((line) => line.id)).toEqual([
    'backup-2',
    'preferred',
    'backup-1',
  ])
})
```

```ts
// packages/core/src/server/route-executor.test.ts
it.each([
  ['timeout', true],
  ['dns', true],
  [502, true],
  [503, true],
  [504, true],
  [401, false],
  [403, false],
  [404, false],
])('classifies %s failover as %s', (failure, expected) => {
  expect(canFailOver(makeFailure(failure))).toBe(expected)
})

it('never overlaps line attempts and sticks to the successful line', async () => {
  let active = 0
  let maxActive = 0
  const attempted: string[] = []
  const result = await executor.execute(profile, async (line) => {
    active += 1
    maxActive = Math.max(maxActive, active)
    attempted.push(line.id)
    active -= 1
    if (line.id === 'preferred') throw makeFailure(503)
    return 'ok'
  })
  expect(result).toEqual({ value: 'ok', lineId: 'backup-1' })
  expect(attempted).toEqual(['preferred', 'backup-1'])
  expect(maxActive).toBe(1)
  expect(executor.currentLine(profile.id)).toBe('backup-1')
})
```

- [x] **Step 2: Run route tests to verify the red state**

Run: `pnpm vitest run packages/core/src/server/{line-order,route-executor}.test.ts`

Expected: FAIL because line ordering and route execution are missing.

- [x] **Step 3: Implement deterministic sequential routing**

```ts
// packages/core/src/server/line-order.ts
export function orderLines(
  profile: ServerProfile,
  stickyLineId: string | null,
): readonly ServerLine[] {
  const enabled = profile.lines.filter((line) => line.enabled)
  const rank = (line: ServerLine): [number, number, string] => [
    line.id === stickyLineId ? 0 : line.id === profile.preferredLineId ? 1 : 2,
    line.priority,
    line.id,
  ]
  return enabled.toSorted((a, b) => {
    const left = rank(a)
    const right = rank(b)
    return left[0] - right[0] || left[1] - right[1] || left[2].localeCompare(right[2])
  })
}
```

```ts
// packages/core/src/server/route-executor.ts
export class RouteExecutor {
  private readonly sticky = new Map<string, string>()

  async execute<T>(
    profile: ServerProfile,
    operation: (line: ServerLine) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<{ value: T; lineId: string }> {
    let lastError: unknown
    for (const line of orderLines(profile, this.sticky.get(profile.id) ?? null)) {
      signal?.throwIfAborted()
      try {
        const value = await operation(line)
        this.sticky.set(profile.id, line.id)
        return { value, lineId: line.id }
      } catch (error) {
        lastError = error
        if (!canFailOver(error)) throw error
      }
    }
    throw lastError ?? new AppError('NetworkUnavailable', 'No enabled server line is available')
  }

  markManualSelection(profileId: string, lineId: string): void {
    this.sticky.set(profileId, lineId)
  }

  currentLine(profileId: string): string | null {
    return this.sticky.get(profileId) ?? null
  }

  clearSession(profileId: string): void {
    this.sticky.delete(profileId)
  }
}
```

Implement `canFailOver` by inspecting `AppError.code`, timeout/network causes, and HTTP status; return true only for `NetworkUnavailable`, `LineTimeout`, `502`, `503`, or `504`.

- [x] **Step 4: Write failing ServerId mismatch test**

```ts
// packages/core/src/server/line-service.test.ts
it('rejects a line that belongs to another logical server', async () => {
  probe.getServerIdentity.mockResolvedValue({ serverId: 'other-server', serverName: 'Other' })
  await expect(service.addLine('profile-1', {
    id: 'line-2',
    label: 'WAN',
    baseUrl: 'https://wan.example',
    priority: 1,
    enabled: true,
  })).rejects.toMatchObject({ code: 'ServerMismatch' })
  expect(storage.saveServerProfile).not.toHaveBeenCalled()
})
```

Run: `pnpm vitest run packages/core/src/server/line-service.test.ts`

Expected: FAIL because `LineService` is missing.

- [x] **Step 5: Implement authenticated identity probing before line persistence**

```ts
// packages/core/src/server/line-service.ts
export interface ServerIdentityProbe {
  getServerIdentity(
    kind: ServerKind,
    baseUrl: string,
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<{ serverId: string; serverName: string }>
}

export class LineService {
  constructor(
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
    private readonly probe: ServerIdentityProbe,
  ) {}

  async addLine(
    profileId: string,
    draft: ServerLine,
    signal?: AbortSignal,
  ): Promise<ServerProfile> {
    const profile = await this.storage.getServerProfile(profileId)
    if (!profile) throw new AppError('StorageFailure', 'Server profile was not found')
    const token = await this.credentials.get(profile.credentialKey)
    if (!token) throw new AppError('AuthenticationExpired', 'Server credential is unavailable')
    const identity = await this.probe.getServerIdentity(
      profile.kind,
      draft.baseUrl,
      token,
      signal,
    )
    if (identity.serverId !== profile.serverId) {
      throw new AppError('ServerMismatch', 'The line belongs to a different server')
    }
    const updated = { ...profile, lines: [...profile.lines, draft] }
    await this.storage.saveServerProfile(updated)
    return updated
  }
}
```

- [x] **Step 6: Write failing settings UI tests for line status and manual selection**

```ts
// apps/desktop/src/views/ServerSettingsView.test.ts
it('shows mismatch without saving and applies a manually preferred line', async () => {
  addLine.mockRejectedValueOnce({ code: 'ServerMismatch' })
  const wrapper = mountSettings()
  await wrapper.get('[data-testid="add-line"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('ServerId mismatch')
  expect(saveProfile).not.toHaveBeenCalled()

  await wrapper.get('[data-testid="prefer-line-2"]').trigger('click')
  expect(setPreferredLine).toHaveBeenCalledWith('profile-1', 'line-2')
  expect(wrapper.get('[data-testid="active-line"]').text()).toContain('WAN')
})
```

Run: `pnpm vitest run apps/desktop/src/views/ServerSettingsView.test.ts`

Expected: FAIL because line settings components are missing.

- [x] **Step 7: Implement line editor, explicit probe outcomes, and active-line indicator**

```ts
// store actions used by ServerSettingsView.vue
async function testAndAddLine(profileId: string, draft: ServerLine): Promise<void> {
  lineStatus.value = { state: 'testing' }
  try {
    const updated = await services.originPolicy.withEphemeralOrigin(
      draft.baseUrl,
      () => services.lines.addLine(profileId, draft),
    )
    replaceProfile(updated)
    lineStatus.value = { state: 'success', lineId: draft.id }
  } catch (error) {
    lineStatus.value = {
      state: 'failure',
      reason: toLineStatusReason(error),
    }
    throw error
  }
}

async function setPreferredLine(profileId: string, lineId: string): Promise<void> {
  const profile = requireProfile(profileId)
  const updated = { ...profile, preferredLineId: lineId }
  await services.catalog.update(updated)
  services.routes.markManualSelection(profileId, lineId)
  replaceProfile(updated)
}
```

Map outcomes exactly to `success`, `timeout`, `authentication-failed`, and `server-mismatch`; do not show repetitive notifications when the sticky line changes automatically.

- [x] **Step 8: Verify line behavior across core and UI**

Run:

```bash
pnpm vitest run packages/core/src/server/line-order.test.ts packages/core/src/server/route-executor.test.ts packages/core/src/server/line-service.test.ts apps/desktop/src/views/ServerSettingsView.test.ts
pnpm typecheck
```

Expected: all scoped tests pass; no route attempt overlaps; mismatch and `401` never persist/fail over; typecheck reports zero errors.

- [ ] **Step 9: Commit deterministic line management**

```bash
git add packages/core/src/server packages/core/src/adapters/emby/emby-adapter.ts packages/core/src/adapters/jellyfin/jellyfin-adapter.ts apps/desktop/src/components/LineEditor.vue apps/desktop/src/components/LineStatus.vue apps/desktop/src/views/ServerSettingsView.vue apps/desktop/src/views/ServerSettingsView.test.ts apps/desktop/src/stores/server-store.ts
git commit -m "feat: validate and fail over server lines"
```

## Task 5: 多服务器管理与当前服务器切换

**可独立验收：** 用户能管理至少两台逻辑服务器，编辑名称，排序、删除、切换当前服务器，启停/排序线路并设置首选线路；删除服务器时先删除其系统凭证。

**Files:**
- Modify: `packages/core/src/server/server-catalog.ts`
- Modify: `packages/core/src/server/server-catalog.test.ts`
- Create: `apps/desktop/src/stores/app-store.ts`
- Test: `apps/desktop/src/stores/app-store.test.ts`
- Modify: `apps/desktop/src/stores/server-store.ts`
- Modify: `apps/desktop/src/stores/server-store.test.ts`
- Create: `apps/desktop/src/components/AppShell.vue`
- Create: `apps/desktop/src/components/ServerSwitcher.vue`
- Create: `apps/desktop/src/components/LibrarySidebar.vue`
- Modify: `apps/desktop/src/views/ServerSettingsView.vue`
- Modify: `apps/desktop/src/views/ServerSettingsView.test.ts`
- Modify: `apps/desktop/src/router/index.ts`
- Modify: `apps/desktop/src/App.vue`

**Interfaces:**
- Consumes: `StoragePort`, `CredentialStore`, `ServerProfile`, `AppPreferences`, `RouteExecutor`.
- Produces: `ServerCatalog.rename(profileId, name)`, `.remove(profileId)`, `.reorder(profileIds)`, `.updateLines(profileId, lines, preferredLineId)`; `AppStore.selectServer(profileId: string | null): Promise<void>`.

- [x] **Step 1: Write failing server administration tests**

```ts
// additions to packages/core/src/server/server-catalog.test.ts
it('deletes the credential before deleting the profile', async () => {
  storage.getServerProfile.mockResolvedValue(profile)
  await catalog.remove(profile.id)
  expect(credentials.delete).toHaveBeenCalledWith(profile.credentialKey)
  expect(storage.deleteServerProfile).toHaveBeenCalledWith(profile.id)
  expect(credentials.delete.mock.invocationCallOrder[0])
    .toBeLessThan(storage.deleteServerProfile.mock.invocationCallOrder[0])
})

it('keeps one enabled preferred line after edits', async () => {
  storage.getServerProfile.mockResolvedValue(profile)
  await expect(catalog.updateLines(profile.id, [
    { ...profile.lines[0], enabled: false },
  ], profile.lines[0].id)).rejects.toMatchObject({ code: 'StorageFailure' })
})
```

- [x] **Step 2: Run administration tests to verify they fail**

Run: `pnpm vitest run packages/core/src/server/server-catalog.test.ts`

Expected: FAIL because credential-aware removal and line updates do not exist.

- [x] **Step 3: Implement credential-safe deletion and profile edits**

```ts
// final public methods in packages/core/src/server/server-catalog.ts
async rename(profileId: string, name: string): Promise<ServerProfile> {
  const profile = await this.requireProfile(profileId)
  const updated = { ...profile, name: name.trim() }
  this.assertValid(updated)
  await this.storage.saveServerProfile(updated)
  return updated
}

async updateLines(
  profileId: string,
  lines: ServerLine[],
  preferredLineId: string,
): Promise<ServerProfile> {
  const profile = await this.requireProfile(profileId)
  const updated = { ...profile, lines, preferredLineId }
  this.assertValid(updated)
  if (!lines.some((line) => line.id === preferredLineId && line.enabled)) {
    throw new AppError('StorageFailure', 'The preferred line must remain enabled')
  }
  await this.storage.saveServerProfile(updated)
  return updated
}

async remove(profileId: string): Promise<void> {
  const profile = await this.requireProfile(profileId)
  await this.credentials.delete(profile.credentialKey)
  await this.storage.deleteServerProfile(profileId)
}

private async requireProfile(profileId: string): Promise<ServerProfile> {
  const profile = await this.storage.getServerProfile(profileId)
  if (!profile) throw new AppError('StorageFailure', 'Server profile was not found')
  return profile
}
```

Change the constructor to receive `StoragePort` and `CredentialStore`; update the Task 2 unit tests with a no-op credential fake.

- [x] **Step 4: Write failing active-server preference tests**

```ts
// apps/desktop/src/stores/app-store.test.ts
it('persists the active server and clears stale route/query state', async () => {
  const app = createAppStoreHarness()
  await app.selectServer('profile-2')
  expect(storage.savePreferences).toHaveBeenCalledWith(expect.objectContaining({
    activeServerId: 'profile-2',
  }))
  expect(routes.clearSession).toHaveBeenCalledWith('profile-1')
  expect(queryClient.cancelQueries).toHaveBeenCalledWith({
    predicate: expect.any(Function),
  })
})
```

Run: `pnpm vitest run apps/desktop/src/stores/app-store.test.ts`

Expected: FAIL because the application store is missing.

- [x] **Step 5: Implement current-server selection**

```ts
// apps/desktop/src/stores/app-store.ts
export const useAppStore = defineStore('app', () => {
  const activeServerId = ref<string | null>(null)

  async function initialize(): Promise<void> {
    const preferences = await services.storage.loadPreferences()
    const profiles = await services.storage.listServerProfiles()
    activeServerId.value = profiles.some((profile) => profile.id === preferences.activeServerId)
      ? preferences.activeServerId
      : profiles[0]?.id ?? null
  }

  async function selectServer(profileId: string | null): Promise<void> {
    const previous = activeServerId.value
    if (previous === profileId) return
    if (previous) services.routes.clearSession(previous)
    await services.queryClient.cancelQueries({
      predicate: (query) => query.queryKey[1] === previous,
    })
    const preferences = await services.storage.loadPreferences()
    await services.storage.savePreferences({ ...preferences, activeServerId: profileId })
    activeServerId.value = profileId
  }

  return { activeServerId, initialize, selectServer }
})
```

- [x] **Step 6: Write failing multi-server shell test**

```ts
// additions to apps/desktop/src/views/ServerSettingsView.test.ts
it('switches, reorders, and deletes logical servers', async () => {
  const wrapper = mountSettings({
    profiles: [profileOne, profileTwo],
  })
  await wrapper.get('[data-testid="server-profile-2"]').trigger('click')
  expect(selectServer).toHaveBeenCalledWith('profile-2')
  await wrapper.get('[data-testid="move-profile-2-up"]').trigger('click')
  expect(reorderServers).toHaveBeenCalledWith(['profile-2', 'profile-1'])
  await wrapper.get('[data-testid="delete-profile-2"]').trigger('click')
  expect(deleteServer).toHaveBeenCalledWith('profile-2')
})
```

Run: `pnpm vitest run apps/desktop/src/views/ServerSettingsView.test.ts apps/desktop/src/stores/server-store.test.ts`

Expected: FAIL because shell controls and store actions are incomplete.

- [x] **Step 7: Implement the application shell and server controls**

```vue
<!-- apps/desktop/src/components/AppShell.vue -->
<template>
  <div class="app-shell">
    <aside>
      <ServerSwitcher
        :profiles="serverStore.profiles"
        :active-id="appStore.activeServerId"
        @select="appStore.selectServer"
      />
      <LibrarySidebar :server-id="appStore.activeServerId" />
    </aside>
    <main><RouterView /></main>
  </div>
</template>
```

```ts
// final store actions
async function deleteServer(profileId: string): Promise<void> {
  await services.catalog.remove(profileId)
  profiles.value = profiles.value.filter((profile) => profile.id !== profileId)
  if (services.app.activeServerId === profileId) {
    const replacement = profiles.value[0]?.id ?? null
    await services.app.selectServer(replacement)
  }
}

async function reorderServers(profileIds: readonly string[]): Promise<void> {
  await services.catalog.reorder(profileIds)
  const byId = new Map(profiles.value.map((profile) => [profile.id, profile]))
  profiles.value = profileIds.flatMap((id) => byId.get(id) ?? [])
}
```

Use explicit confirmation before deletion. Keep server sorting in `server_profiles.sort_order`; line sorting remains `priority`.

- [x] **Step 8: Verify multi-server behavior**

Run:

```bash
pnpm vitest run packages/core/src/server/server-catalog.test.ts apps/desktop/src/stores/{app-store,server-store}.test.ts apps/desktop/src/views/ServerSettingsView.test.ts
pnpm typecheck
```

Expected: scoped tests pass; two profiles can be switched/reordered; delete invokes credential removal first; typecheck reports zero errors.

- [ ] **Step 9: Commit multi-server management**

```bash
git add packages/core/src/server/server-catalog.ts packages/core/src/server/server-catalog.test.ts apps/desktop/src/stores apps/desktop/src/components/AppShell.vue apps/desktop/src/components/ServerSwitcher.vue apps/desktop/src/components/LibrarySidebar.vue apps/desktop/src/views/ServerSettingsView.vue apps/desktop/src/views/ServerSettingsView.test.ts apps/desktop/src/router/index.ts apps/desktop/src/App.vue
git commit -m "feat: manage and switch logical servers"
```

## Task 6: 当前服务器首页与分页媒体浏览

**可独立验收：** 当前服务器首页显示继续观看与媒体库入口；用户能分页浏览电影、电视剧、季和剧集；主线路超时/`503` 时浏览请求由备用线路完成。

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/media/types.ts`
- Create: `packages/core/src/media/media-server-adapter.ts`
- Create: `packages/core/src/media/media-service.ts`
- Test: `packages/core/src/media/media-service.test.ts`
- Modify: `packages/core/src/adapters/emby/emby-dto.ts`
- Modify: `packages/core/src/adapters/emby/emby-mapper.ts`
- Modify: `packages/core/src/adapters/emby/emby-adapter.ts`
- Test: `packages/core/src/adapters/emby/emby-adapter.test.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-dto.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-mapper.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-adapter.ts`
- Test: `packages/core/src/adapters/jellyfin/jellyfin-adapter.test.ts`
- Create: `tests/fixtures/emby/libraries.json`
- Create: `tests/fixtures/emby/items.json`
- Create: `tests/fixtures/jellyfin/libraries.json`
- Create: `tests/fixtures/jellyfin/items.json`
- Create: `apps/desktop/src/stores/media-store.ts`
- Test: `apps/desktop/src/stores/media-store.test.ts`
- Create: `apps/desktop/src/views/HomeView.vue`
- Test: `apps/desktop/src/views/HomeView.test.ts`
- Create: `apps/desktop/src/views/LibraryView.vue`
- Test: `apps/desktop/src/views/LibraryView.test.ts`
- Create: `apps/desktop/src/components/MediaCard.vue`
- Create: `apps/desktop/src/components/VirtualPosterGrid.vue`
- Test: `apps/desktop/src/components/VirtualPosterGrid.test.ts`
- Create: `apps/desktop/src/platform/images/secure-image-loader.ts`
- Test: `apps/desktop/src/platform/images/secure-image-loader.test.ts`
- Create: `apps/desktop/src/queries/use-secure-image.ts`
- Modify: `apps/desktop/src/components/LibrarySidebar.vue`
- Modify: `apps/desktop/src/router/index.ts`

**Interfaces:**
- Consumes: `StoragePort`, `CredentialStore`, `RouteExecutor`, `RequestContext`, `ServerProfile`.
- Produces: canonical `Library`, `MediaItem`, `Page`, `ItemQuery`, `SearchQuery`; `MediaBrowseAdapter = Pick<MediaServerAdapter, 'getLibraries' | 'getItems' | 'getContinueWatching' | 'search'>`; `MediaService` methods returning `{ value, lineId }`; `loadSecureImage(url, headers): Promise<string>` returning a blob/object URL that never embeds Token in `img src`.

- [x] **Step 1: Write failing Emby/Jellyfin fixture mapping tests**

```ts
// same assertions in each adapter test, using provider-specific fixture
it('maps libraries, paged items, and resume position into domain models', async () => {
  transport.enqueue(librariesFixture, itemsFixture, itemsFixture)
  const libraries = await adapter.getLibraries(context)
  const page = await adapter.getItems({
    libraryId: 'library-1',
    kinds: ['movie', 'series'],
    startIndex: 0,
    limit: 60,
  }, context)
  const resume = await adapter.getContinueWatching(context)

  expect(libraries).toEqual([
    { id: 'library-1', name: 'Movies', collectionType: 'movies' },
  ])
  expect(page).toMatchObject({
    total: 1,
    startIndex: 0,
    items: [{
      id: 'item-1',
      kind: 'movie',
      runtimeSeconds: 7200,
      playbackPositionSeconds: 120,
    }],
  })
  expect(resume[0]?.playbackPositionSeconds).toBe(120)
})
```

- [x] **Step 2: Run adapter mapping tests to verify the red state**

Run: `pnpm vitest run packages/core/src/adapters/{emby,jellyfin}/*.test.ts`

Expected: FAIL because media DTOs, mappers, and browse methods are absent.

- [x] **Step 3: Implement provider-specific DTO mapping and browse requests**

```ts
// packages/core/src/adapters/jellyfin/jellyfin-mapper.ts
export function mapItem(dto: JellyfinItemDto): MediaItem {
  return {
    id: dto.Id,
    kind: mapKind(dto.Type),
    name: dto.Name,
    overview: dto.Overview ?? null,
    productionYear: dto.ProductionYear ?? null,
    runtimeSeconds: dto.RunTimeTicks == null ? null : dto.RunTimeTicks / 10_000_000,
    parentId: dto.ParentId ?? null,
    seriesId: dto.SeriesId ?? null,
    indexNumber: dto.IndexNumber ?? null,
    imageTag: dto.ImageTags?.Primary ?? null,
    playbackPositionSeconds: (dto.UserData?.PlaybackPositionTicks ?? 0) / 10_000_000,
  }
}
```

```ts
// browse request implementation used in each provider adapter
async getItems(query: ItemQuery, context: RequestContext): Promise<Page<MediaItem>> {
  const response = await this.authorizedRequest<ItemsResultDto>(context, {
    path: `/Users/${context.userId}/Items`,
    method: 'GET',
    query: {
      ParentId: query.libraryId ?? query.parentId,
      Ids: query.ids?.join(','),
      IncludeItemTypes: query.kinds?.map(toProviderKind).join(','),
      Recursive: query.parentId ? false : true,
      StartIndex: query.startIndex,
      Limit: query.limit,
      Fields: 'Overview,ProductionYear,RunTimeTicks,ParentId,SeriesId,IndexNumber',
      EnableImages: true,
    },
  })
  return {
    items: response.data.Items.map(mapItem),
    total: response.data.TotalRecordCount,
    startIndex: query.startIndex,
  }
}
```

Use `/Library/VirtualFolders` for libraries and `/Users/{userId}/Items/Resume` for continue watching. Send Token through `X-Emby-Token`, never as an `api_key` query parameter. Treat `401/403` as `AuthenticationExpired`.

- [x] **Step 4: Write failing routed media-service test**

```ts
// packages/core/src/media/media-service.test.ts
it('retries a browse request on the backup line and returns the active line', async () => {
  adapter.getLibraries
    .mockRejectedValueOnce(new HttpFailure(503))
    .mockResolvedValueOnce([{ id: 'lib', name: 'Movies', collectionType: 'movies' }])
  const result = await service.getLibraries('profile-1')
  expect(result.lineId).toBe('line-backup')
  expect(adapter.getLibraries.mock.calls.map(([context]) => context.line.id))
    .toEqual(['line-primary', 'line-backup'])
})

it('raises AuthenticationExpired without trying a second line', async () => {
  adapter.getLibraries.mockRejectedValue(new AppError('AuthenticationExpired', 'expired'))
  await expect(service.getLibraries('profile-1')).rejects.toMatchObject({
    code: 'AuthenticationExpired',
  })
  expect(adapter.getLibraries).toHaveBeenCalledTimes(1)
})
```

Run: `pnpm vitest run packages/core/src/media/media-service.test.ts`

Expected: FAIL because `MediaService` is missing.

- [x] **Step 5: Implement routed media operations**

```ts
// packages/core/src/media/media-service.ts
export class MediaService {
  constructor(
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
    private readonly routes: RouteExecutor,
    private readonly adapterFor: (kind: ServerKind) => MediaBrowseAdapter,
  ) {}

  getLibraries(profileId: string, signal?: AbortSignal) {
    return this.execute(profileId, (adapter, context) => adapter.getLibraries(context), signal)
  }

  getContinueWatching(profileId: string, signal?: AbortSignal) {
    return this.execute(profileId, (adapter, context) => adapter.getContinueWatching(context), signal)
  }

  getItems(profileId: string, query: ItemQuery, signal?: AbortSignal) {
    return this.execute(profileId, (adapter, context) => adapter.getItems(query, context), signal)
  }

  search(profileId: string, query: SearchQuery, signal?: AbortSignal) {
    return this.execute(profileId, (adapter, context) => adapter.search(query, context), signal)
  }

  private async execute<T>(
    profileId: string,
    call: (adapter: MediaBrowseAdapter, context: RequestContext) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<{ value: T; lineId: string }> {
    const profile = await this.storage.getServerProfile(profileId)
    if (!profile) throw new AppError('StorageFailure', 'Server profile was not found')
    const accessToken = await this.credentials.get(profile.credentialKey)
    if (!accessToken) throw new AppError('AuthenticationExpired', 'Server credential is unavailable')
    return this.routes.execute(
      profile,
      (line) => call(this.adapterFor(profile.kind), {
        profileId, line, userId: profile.userId, accessToken, signal,
      }),
      signal,
    )
  }
}
```

- [x] **Step 6: Write failing Home and Library view tests**

```ts
// apps/desktop/src/views/HomeView.test.ts
it('shows continue watching and library entries for the active server', async () => {
  media.getContinueWatching.mockResolvedValue({ value: [movie], lineId: 'line-2' })
  media.getLibraries.mockResolvedValue({ value: [library], lineId: 'line-2' })
  const wrapper = mountHome({ activeServerId: 'profile-1' })
  await flushPromises()
  expect(wrapper.text()).toContain('Continue Watching')
  expect(wrapper.text()).toContain(movie.name)
  expect(wrapper.text()).toContain(library.name)
  expect(wrapper.get('[data-testid="active-line"]').text()).toContain('line-2')
})
```

```ts
// apps/desktop/src/views/LibraryView.test.ts
it('requests a 60-item server page and links series to seasons', async () => {
  const wrapper = mountLibrary({ serverId: 'profile-1', libraryId: 'lib-1' })
  await flushPromises()
  expect(media.getItems).toHaveBeenCalledWith('profile-1', {
    libraryId: 'lib-1',
    startIndex: 0,
    limit: 60,
    kinds: ['movie', 'series'],
  }, expect.any(AbortSignal))
  expect(wrapper.get(`[data-item-id="${series.id}"]`).attributes('href'))
    .toContain(`/media/${series.id}`)
})
```

Run: `pnpm vitest run apps/desktop/src/views/{HomeView,LibraryView}.test.ts`

Expected: FAIL because media store and views are absent.

- [x] **Step 7: Implement home, library paging, and active line display**

```ts
// apps/desktop/src/stores/media-store.ts
export const useMediaStore = defineStore('media', () => {
  const libraries = ref<readonly Library[]>([])
  const continueWatching = ref<readonly MediaItem[]>([])
  const activeLineId = ref<string | null>(null)

  async function loadHome(serverId: string, signal?: AbortSignal): Promise<void> {
    const [libraryResult, resumeResult] = await Promise.all([
      services.media.getLibraries(serverId, signal),
      services.media.getContinueWatching(serverId, signal),
    ])
    libraries.value = libraryResult.value
    continueWatching.value = resumeResult.value
    activeLineId.value = resumeResult.lineId
  }

  return { libraries, continueWatching, activeLineId, loadHome }
})
```

```vue
<!-- essential paging contract in apps/desktop/src/views/LibraryView.vue -->
<VirtualPosterGrid
  :items="page.items"
  :estimate-size="220"
  @visible-range="ensureImages"
/>
<button
  v-if="page.startIndex + page.items.length < page.total"
  data-testid="next-page"
  @click="load(page.startIndex + 60)"
>
  Next
</button>
```

`VirtualPosterGrid` uses `@tanstack/vue-virtual` and only mounts visible `MediaCard` rows. `secure-image-loader` fetches poster bytes through `HttpTransport` with in-memory Token headers, then exposes a revoked-on-unmount object URL; `img` attributes must never contain Access Token query parameters.

For a series route, request `kinds: ['season']` with `parentId: seriesId`; for a season route, request `kinds: ['episode']` with `parentId: seasonId`.

- [x] **Step 8: Verify browse behavior**

Run:

```bash
pnpm vitest run packages/core/src/adapters packages/core/src/media apps/desktop/src/stores/media-store.test.ts apps/desktop/src/views/HomeView.test.ts apps/desktop/src/views/LibraryView.test.ts apps/desktop/src/components/VirtualPosterGrid.test.ts apps/desktop/src/platform/images/secure-image-loader.test.ts
pnpm typecheck
```

Expected: provider fixtures map identically; routed browsing fails over only on allowed errors; UI requests 60-item pages, virtualizes the poster wall, lazy-loads posters without Token-in-URL, and renders all four media kinds.

- [ ] **Step 9: Commit current-server browsing**

```bash
git add packages/core/src/media packages/core/src/adapters tests/fixtures/emby tests/fixtures/jellyfin apps/desktop/src/stores/media-store.ts apps/desktop/src/stores/media-store.test.ts apps/desktop/src/views/HomeView.vue apps/desktop/src/views/HomeView.test.ts apps/desktop/src/views/LibraryView.vue apps/desktop/src/views/LibraryView.test.ts apps/desktop/src/components/MediaCard.vue apps/desktop/src/components/VirtualPosterGrid.vue apps/desktop/src/components/VirtualPosterGrid.test.ts apps/desktop/src/platform/images apps/desktop/src/queries/use-secure-image.ts apps/desktop/src/components/LibrarySidebar.vue apps/desktop/src/router/index.ts
git commit -m "feat: browse current server media"
```

## Task 7: 当前服务器搜索与最小媒体详情

**可独立验收：** 顶部搜索只查当前服务器；电影详情显示最小字段、播放/续播入口；剧集详情按系列→季→剧集导航，不加载演职员或相关推荐。

**Files:**
- Modify: `packages/core/src/adapters/emby/emby-adapter.ts`
- Modify: `packages/core/src/adapters/emby/emby-adapter.test.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-adapter.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-adapter.test.ts`
- Create: `apps/desktop/src/views/SearchView.vue`
- Test: `apps/desktop/src/views/SearchView.test.ts`
- Create: `apps/desktop/src/views/MediaDetailView.vue`
- Test: `apps/desktop/src/views/MediaDetailView.test.ts`
- Modify: `apps/desktop/src/components/AppShell.vue`
- Modify: `apps/desktop/src/stores/media-store.ts`
- Modify: `apps/desktop/src/router/index.ts`

**Interfaces:**
- Consumes: `MediaService.search(profileId, SearchQuery, signal)`, `MediaService.getItems(profileId, ItemQuery, signal)`, `MediaItem`.
- Produces: routes `/search?q=`, `/media/:itemId`; no new cross-package interface.

- [x] **Step 1: Write failing provider search parameter tests**

```ts
// addition to each provider adapter test
  it('searches only the selected user/server with bounded paging', async () => {
    transport.enqueue(itemsFixture)
    await adapter.search({
      term: 'Arrival',
      kinds: ['movie', 'series'],
      startIndex: 0,
      limit: 40,
    }, context)
    expect(transport.lastRequest()).toMatchObject({
      baseUrl: context.line.baseUrl,
      path: `/Users/${context.userId}/Items`,
      query: {
        SearchTerm: 'Arrival',
        IncludeItemTypes: 'Movie,Series',
        StartIndex: 0,
        Limit: 40,
      },
    })
  })
```

Run: `pnpm vitest run packages/core/src/adapters/{emby,jellyfin}/*.test.ts -t searches`

Expected: FAIL because provider search request mapping is incomplete.

- [x] **Step 2: Implement bounded provider search**

```ts
// method added to each provider adapter
async search(query: SearchQuery, context: RequestContext): Promise<Page<MediaItem>> {
  if (!query.term.trim()) return { items: [], total: 0, startIndex: query.startIndex }
  const response = await this.authorizedRequest<ItemsResultDto>(context, {
    path: `/Users/${context.userId}/Items`,
    method: 'GET',
    query: {
      SearchTerm: query.term.trim(),
      IncludeItemTypes: query.kinds?.map(toProviderKind).join(','),
      Recursive: true,
      StartIndex: query.startIndex,
      Limit: Math.min(query.limit, 100),
    },
  })
  return {
    items: response.data.Items.map(mapItem),
    total: response.data.TotalRecordCount,
    startIndex: query.startIndex,
  }
}
```

- [x] **Step 3: Write failing search view tests**

```ts
// apps/desktop/src/views/SearchView.test.ts
it('debounces 250 ms and scopes search to the active server', async () => {
  vi.useFakeTimers()
  const wrapper = mountSearch({ activeServerId: 'profile-2' })
  await wrapper.get('[name="search"]').setValue('Arrival')
  await vi.advanceTimersByTimeAsync(249)
  expect(media.search).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(media.search).toHaveBeenCalledWith('profile-2', {
    term: 'Arrival',
    kinds: ['movie', 'series', 'season', 'episode'],
    startIndex: 0,
    limit: 40,
  }, expect.any(AbortSignal))
})
```

Run: `pnpm vitest run apps/desktop/src/views/SearchView.test.ts`

Expected: FAIL because the search route/view is missing.

- [x] **Step 4: Implement current-server search**

```ts
// search action used by SearchView.vue
let searchController: AbortController | null = null

async function searchCurrentServer(serverId: string, term: string): Promise<void> {
  searchController?.abort()
  searchController = new AbortController()
  const result = await services.media.search(serverId, {
    term,
    kinds: ['movie', 'series', 'season', 'episode'],
    startIndex: 0,
    limit: 40,
  }, searchController.signal)
  searchResults.value = result.value
  activeLineId.value = result.lineId
}
```

Use a 250 ms timer in `SearchView.vue`; clear the timer and abort controller on unmount or server change.

- [x] **Step 5: Write failing movie and series detail tests**

```ts
// apps/desktop/src/views/MediaDetailView.test.ts
it('renders only the minimum movie detail and resume action', async () => {
  media.getItems.mockResolvedValue({ value: {
    items: [{ ...movie, playbackPositionSeconds: 120 }],
    total: 1,
    startIndex: 0,
  }, lineId: 'line-1' })
  const wrapper = mountDetail({ itemId: movie.id })
  await flushPromises()
  expect(wrapper.text()).toContain(movie.name)
  expect(wrapper.text()).toContain(String(movie.productionYear))
  expect(wrapper.text()).toContain(movie.overview)
  expect(wrapper.get('[data-testid="resume"]').text()).toContain('02:00')
  expect(wrapper.find('[data-testid="cast"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="recommendations"]').exists()).toBe(false)
})

it('loads seasons for a series and episodes for the selected season', async () => {
  const wrapper = mountSeriesDetail()
  await flushPromises()
  expect(media.getItems).toHaveBeenCalledWith('profile-1', expect.objectContaining({
    parentId: 'series-1',
    kinds: ['season'],
  }), expect.any(AbortSignal))
  await wrapper.get('[data-season-id="season-1"]').trigger('click')
  expect(media.getItems).toHaveBeenCalledWith('profile-1', expect.objectContaining({
    parentId: 'season-1',
    kinds: ['episode'],
  }), expect.any(AbortSignal))
})
```

Run: `pnpm vitest run apps/desktop/src/views/MediaDetailView.test.ts`

Expected: FAIL because the detail view is missing.

- [x] **Step 6: Implement minimal detail navigation**

```ts
// detail loaders
async function loadItem(serverId: string, itemId: string, signal: AbortSignal): Promise<MediaItem> {
  const result = await services.media.getItems(serverId, {
    ids: [itemId],
    startIndex: 0,
    limit: 1,
  }, signal)
  const item = result.value.items[0]
  if (!item) throw new AppError('NetworkUnavailable', 'Media item was not found')
  return item
}

async function loadChildren(
  serverId: string,
  parentId: string,
  kind: 'season' | 'episode',
  signal: AbortSignal,
): Promise<readonly MediaItem[]> {
  const result = await services.media.getItems(serverId, {
    parentId,
    kinds: [kind],
    startIndex: 0,
    limit: 200,
  }, signal)
  return result.value.items
}
```

Render title, year, overview, runtime/media summary, Play, and Resume. Do not request people or recommendation endpoints.

- [x] **Step 7: Verify search and detail**

Run:

```bash
pnpm vitest run packages/core/src/adapters/{emby,jellyfin}/*.test.ts apps/desktop/src/views/SearchView.test.ts apps/desktop/src/views/MediaDetailView.test.ts
pnpm typecheck
```

Expected: search is server-scoped and bounded; movie/series detail tests pass; no advanced PDP endpoint is called.

- [ ] **Step 8: Commit search and detail**

```bash
git add packages/core/src/adapters apps/desktop/src/views/SearchView.vue apps/desktop/src/views/SearchView.test.ts apps/desktop/src/views/MediaDetailView.vue apps/desktop/src/views/MediaDetailView.test.ts apps/desktop/src/components/AppShell.vue apps/desktop/src/stores/media-store.ts apps/desktop/src/router/index.ts
git commit -m "feat: search and inspect current server media"
```

## Task 8: 独立 mpv Sidecar 与受限 JSON IPC

**可独立验收：** Rust 启动测试 sidecar，创建随机且当前用户可访问的 IPC，先设置内存请求头再 `loadfile`，并把 mpv 属性/事件转换成稳定 Tauri 事件；暂停、恢复、跳转、停止均可控且会话结束清理资源。

**Files:**
- Create: `apps/desktop/src-tauri/src/mpv/mod.rs`
- Create: `apps/desktop/src-tauri/src/mpv/process.rs`
- Create: `apps/desktop/src-tauri/src/mpv/protocol.rs`
- Create: `apps/desktop/src-tauri/src/mpv/session.rs`
- Create: `apps/desktop/src-tauri/src/mpv/ipc/mod.rs`
- Create: `apps/desktop/src-tauri/src/mpv/ipc/unix.rs`
- Create: `apps/desktop/src-tauri/src/mpv/ipc/windows.rs`
- Create: `apps/desktop/src-tauri/src/commands/player.rs`
- Test: `apps/desktop/src-tauri/tests/mpv_session.rs`
- Create: `tests/integration/support/fake-mpv.mjs`
- Create: `apps/desktop/src/platform/player/tauri-player-engine.ts`
- Test: `apps/desktop/src/platform/player/tauri-player-engine.test.ts`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/composition/create-services.ts`

**Interfaces:**
- Consumes: canonical `PlaybackPlan`, `PlayerEvent`, `PlayerEngine`.
- Produces: commands `player_play`, `player_pause`, `player_resume`, `player_seek`, `player_stop`; event channel `player://event`; Rust `MpvSession`.

- [x] **Step 1: Write failing JSON protocol tests**

```rust
// unit tests in apps/desktop/src-tauri/src/mpv/protocol.rs
#[test]
fn sets_headers_before_loading_the_url() {
    let plan = test_plan();
    let commands = play_commands(&plan);
    assert_eq!(commands[0].command_name(), "set_property");
    assert_eq!(commands[0].property_name(), Some("http-header-fields"));
    assert_eq!(commands[1].command_name(), "loadfile");
    assert!(!serde_json::to_string(&commands[1]).unwrap().contains("secret-token"));
}

#[test]
fn maps_observed_properties_to_stable_events() {
    assert_eq!(
        map_mpv_event(r#"{"event":"property-change","name":"pause","data":true}"#).unwrap(),
        Some(NativePlayerEvent::Paused)
    );
}
```

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mpv::protocol`

Expected: FAIL because mpv protocol types are missing.

- [x] **Step 2: Implement allowlisted mpv commands and event decoding**

```rust
// apps/desktop/src-tauri/src/mpv/protocol.rs
#[derive(Debug, serde::Serialize)]
pub struct MpvCommand {
    command: Vec<serde_json::Value>,
    request_id: u64,
}

pub fn play_commands(plan: &NativePlaybackPlan) -> [MpvCommand; 2] {
    let headers = plan.request_headers.iter()
        .map(|(name, value)| format!("{name}: {value}"))
        .collect::<Vec<_>>()
        .join(",");
    [
        MpvCommand::new(1, vec![
            "set_property".into(),
            "http-header-fields".into(),
            headers.into(),
        ]),
        MpvCommand::new(2, vec![
            "loadfile".into(),
            plan.stream_url.clone().into(),
            "replace".into(),
            format!("start={}", plan.start_position_seconds).into(),
        ]),
    ]
}

pub fn control_command(action: ControlAction) -> MpvCommand {
    match action {
        ControlAction::Pause => MpvCommand::set_property(10, "pause", true),
        ControlAction::Resume => MpvCommand::set_property(11, "pause", false),
        ControlAction::Seek(seconds) => MpvCommand::command(12, "seek", seconds),
        ControlAction::Stop => MpvCommand::simple(13, "stop"),
    }
}
```

Only permit `set_property(http-header-fields|pause)`, `loadfile`, `seek`, `stop`, and the required `observe_property` calls. There is no generic command from WebView to mpv.

- [x] **Step 3: Write failing random-endpoint and cleanup integration tests**

```rust
// apps/desktop/src-tauri/tests/mpv_session.rs
#[tokio::test]
async fn creates_unique_private_ipc_and_cleans_it_after_stop() {
    let first = TestHarness::start().await;
    let second = TestHarness::start().await;
    assert_ne!(first.endpoint(), second.endpoint());
    assert!(first.endpoint_is_current_user_only().await);
    let endpoint = first.endpoint().to_owned();
    first.stop().await.expect("stop session");
    assert!(!endpoint_exists(&endpoint).await);
}

#[tokio::test]
async fn emits_started_pause_seek_and_end_events() {
    let mut harness = TestHarness::start().await;
    harness.play(test_plan()).await.expect("play");
    assert_eq!(harness.next_event().await, NativePlayerEvent::Started { position_seconds: 0.0, duration_seconds: 120.0 });
    harness.pause().await.expect("pause");
    harness.seek(30.0).await.expect("seek");
    assert!(matches!(harness.next_event().await, NativePlayerEvent::Paused { .. }));
    assert!(matches!(harness.next_event().await, NativePlayerEvent::Seeked { position_seconds: 30.0, .. }));
}
```

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test mpv_session`

Expected: FAIL because process/session/IPC modules and fake sidecar are absent.

- [x] **Step 4: Implement the fake mpv and platform IPC endpoints**

```js
// tests/integration/support/fake-mpv.mjs
import net from 'node:net'

const endpoint = process.argv.find((arg) => arg.startsWith('--input-ipc-server='))?.split('=')[1]
if (!endpoint) process.exit(2)

const server = net.createServer((socket) => {
  socket.setEncoding('utf8')
  let buffer = ''
  socket.on('data', (chunk) => {
    buffer += chunk
    for (;;) {
      const newline = buffer.indexOf('\n')
      if (newline < 0) break
      const request = JSON.parse(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      socket.write(`${JSON.stringify({ request_id: request.request_id, error: 'success' })}\n`)
      if (request.command[0] === 'loadfile') {
        socket.write('{"event":"file-loaded"}\n')
        socket.write('{"event":"property-change","name":"duration","data":120}\n')
        socket.write('{"event":"property-change","name":"time-pos","data":0}\n')
      }
      if (request.command[0] === 'seek') {
        socket.write(`{"event":"seek","position":${request.command[1]}}\n`)
      }
    }
  })
})

server.listen(endpoint)
```

```rust
// apps/desktop/src-tauri/src/mpv/ipc/mod.rs
#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

pub fn random_endpoint(runtime_dir: &std::path::Path) -> IpcEndpoint {
    let id = uuid::Uuid::new_v4();
    #[cfg(unix)]
    return IpcEndpoint::Unix(runtime_dir.join(format!("lumaroute-mpv-{id}.sock")));
    #[cfg(windows)]
    return IpcEndpoint::Windows(format!(r"\\.\pipe\lumaroute-mpv-{id}"));
}
```

On Unix create the runtime directory with mode `0700`, wait for mpv's socket, set/verify mode `0600`, and delete it on `Drop`. On Windows wait for mpv's named pipe, open its handle, replace the DACL with current-user SID plus SYSTEM through `SetSecurityInfo`, then verify that descriptor in the Windows-only test.

- [x] **Step 5: Implement mpv process/session lifecycle**

```rust
// apps/desktop/src-tauri/src/mpv/process.rs
pub async fn spawn_mpv(
    executable: &std::path::Path,
    endpoint: &IpcEndpoint,
) -> Result<tokio::process::Child, NativeError> {
    verify_allowlisted_resource(executable)?;
    // Real mpv rejects a separate `--input-ipc-server PATH` argv pair and exits
    // before creating the IPC socket; always use the equals form.
    tokio::process::Command::new(executable)
        .args(mpv_launch_args(endpoint.as_argument())) // includes `--input-ipc-server=PATH`
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(NativeError::player_unavailable)
}
```

```rust
// public lifecycle in apps/desktop/src-tauri/src/mpv/session.rs
impl MpvSession {
    pub async fn play(&mut self, plan: NativePlaybackPlan) -> Result<(), NativeError> {
        self.ensure_started().await?;
        for command in play_commands(&plan) {
            self.ipc.send(command).await?;
        }
        self.wait_for_file_loaded(std::time::Duration::from_secs(12)).await
    }

    pub async fn stop(&mut self) -> Result<(), NativeError> {
        self.ipc.send(control_command(ControlAction::Stop)).await?;
        self.shutdown_process().await;
        self.endpoint.cleanup().await
    }
}
```

Subscribe to `time-pos`, `duration`, `pause`, `path`, `idle-active`, `end-file`, and command errors; never serialize request headers into errors or logs.

Run:

```bash
cd apps/desktop/src-tauri
cargo add tokio --features process,io-util,net,macros,time,sync
cargo add serde_json
cargo add uuid --features v4
cargo add --target 'cfg(windows)' windows --features Win32_Foundation,Win32_Security,Win32_System_Pipes
cd ../../..
```

Expected: `Cargo.lock` records the IPC/process dependencies; Windows-only APIs are not compiled on Unix.

- [x] **Step 6: Write failing TypeScript bridge tests**

```ts
// apps/desktop/src/platform/player/tauri-player-engine.test.ts
it('uses allowlisted commands and unsubscribes from the native event channel', async () => {
  const engine = new TauriPlayerEngine(invoke, listen)
  const listener = vi.fn()
  const unsubscribe = engine.subscribe(listener)
  await engine.play(plan)
  expect(invoke).toHaveBeenCalledWith('player_play', { plan })
  nativeHandler({ payload: { type: 'started', positionSeconds: 0, durationSeconds: 120 } })
  expect(listener).toHaveBeenCalledWith({ type: 'started', positionSeconds: 0, durationSeconds: 120 })
  unsubscribe()
  expect(nativeUnlisten).toHaveBeenCalled()
})
```

Run: `pnpm vitest run apps/desktop/src/platform/player/tauri-player-engine.test.ts`

Expected: FAIL because the bridge is missing.

- [x] **Step 7: Implement the stable TypeScript PlayerEngine bridge**

```ts
// apps/desktop/src/platform/player/tauri-player-engine.ts
export class TauriPlayerEngine implements PlayerEngine {
  constructor(
    private readonly invokeFn: typeof invoke,
    private readonly listenFn: typeof listen,
  ) {}

  play(plan: PlaybackPlan): Promise<void> {
    return this.invokeFn('player_play', { plan })
  }

  pause(): Promise<void> {
    return this.invokeFn('player_pause')
  }

  resume(): Promise<void> {
    return this.invokeFn('player_resume')
  }

  seek(positionSeconds: number): Promise<void> {
    return this.invokeFn('player_seek', { positionSeconds })
  }

  stop(): Promise<void> {
    return this.invokeFn('player_stop')
  }

  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe {
    let disposed = false
    let unlisten: UnlistenFn | null = null
    void this.listenFn<PlayerEvent>('player://event', ({ payload }) => {
      if (!disposed) listener(payload)
    }).then((fn) => {
      unlisten = fn
      if (disposed) fn()
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }
}
```

- [x] **Step 8: Verify native and TypeScript player layers**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mpv
pnpm vitest run packages/player apps/desktop/src/platform/player/tauri-player-engine.test.ts
pnpm typecheck
```

Expected: protocol/unit/integration tests pass; endpoints are unique/private/cleaned; command and event types agree.

- [ ] **Step 9: Commit the mpv engine**

```bash
git add apps/desktop/src-tauri/src/mpv apps/desktop/src-tauri/src/commands/player.rs apps/desktop/src-tauri/src/commands/mod.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/mpv_session.rs tests/integration/support/fake-mpv.mjs apps/desktop/src/platform/player apps/desktop/src/composition/create-services.ts
git commit -m "feat: control mpv through restricted native IPC"
```

## Task 9: 直放计划、直接串流与播放启动换线

**可独立验收：** 详情页能获取并启动原文件直放或不转码直接串流；只支持转码时显示明确原因；首选线路加载失败时通过备用线路重新生成播放计划并加载。

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/adapters/emby/emby-dto.ts`
- Modify: `packages/core/src/adapters/emby/emby-mapper.ts`
- Modify: `packages/core/src/adapters/emby/emby-adapter.ts`
- Modify: `packages/core/src/adapters/emby/emby-adapter.test.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-dto.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-mapper.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-adapter.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-adapter.test.ts`
- Create: `tests/fixtures/emby/playback-info.json`
- Create: `tests/fixtures/jellyfin/playback-info.json`
- Create: `packages/core/src/playback/playback-service.ts`
- Test: `packages/core/src/playback/playback-service.test.ts`
- Create: `apps/desktop/src/stores/player-store.ts`
- Test: `apps/desktop/src/stores/player-store.test.ts`
- Create: `apps/desktop/src/components/PlayerControls.vue`
- Modify: `apps/desktop/src/views/MediaDetailView.vue`
- Modify: `apps/desktop/src/views/MediaDetailView.test.ts`

**Interfaces:**
- Consumes: `MediaServerAdapter.getPlaybackPlan`, `RouteExecutor`, `CredentialStore`, `StoragePort`, `PlayerEngine`.
- Produces: `PlaybackService.play(profileId, itemId, startPositionSeconds?: number): Promise<{ plan: PlaybackPlan; lineId: string }>`; canonical `PlaybackPlan`.

- [x] **Step 1: Write failing playback-plan mapping tests**

```ts
// same behavioral cases in each provider adapter test
it('prefers direct play and keeps authentication in headers', async () => {
  transport.enqueue(playbackInfoFixture)
  const plan = await adapter.getPlaybackPlan('item-1', context)
  expect(plan).toMatchObject({
    itemId: 'item-1',
    mediaSourceId: 'source-direct',
    method: 'direct-play',
  })
  expect(plan.streamUrl).toBe(
    `${context.line.baseUrl}/Videos/item-1/stream.mkv?Static=true&MediaSourceId=source-direct`,
  )
  expect(plan.requestHeaders).toEqual({ 'X-Emby-Token': context.accessToken })
  expect(plan.streamUrl).not.toContain(context.accessToken)
})

it('accepts remux-only direct stream and rejects transcoding', async () => {
  transport.enqueue(remuxFixture)
  await expect(adapter.getPlaybackPlan('item-2', context))
    .resolves.toMatchObject({ method: 'direct-stream' })
  transport.enqueue(transcodeOnlyFixture)
  await expect(adapter.getPlaybackPlan('item-3', context))
    .rejects.toMatchObject({ code: 'MediaNotDirectPlayable' })
})
```

Run: `pnpm vitest run packages/core/src/adapters/{emby,jellyfin}/*.test.ts -t "direct play|direct stream"`

Expected: FAIL because playback DTO mapping is absent.

- [x] **Step 2: Implement direct-play/direct-stream selection**

```ts
// selection function in each provider mapper
export function selectPlaybackPlan(
  itemId: string,
  dto: PlaybackInfoDto,
  context: RequestContext,
): PlaybackPlan {
  const source = dto.MediaSources.find((candidate) => candidate.SupportsDirectPlay)
    ?? dto.MediaSources.find((candidate) =>
      candidate.SupportsDirectStream && candidate.TranscodingUrl != null
      && candidate.TranscodingUrl.includes('VideoCodec=copy')
      && candidate.TranscodingUrl.includes('AudioCodec=copy'),
    )
  if (!source) {
    throw new AppError('MediaNotDirectPlayable', 'The server requires video or audio transcoding')
  }
  const direct = source.SupportsDirectPlay
  const relativeUrl = direct
    ? `/Videos/${itemId}/stream.${source.Container}?Static=true&MediaSourceId=${encodeURIComponent(source.Id)}`
    : stripCredentialQuery(source.TranscodingUrl!)
  return {
    itemId,
    mediaSourceId: source.Id,
    playSessionId: dto.PlaySessionId,
    streamUrl: `${context.line.baseUrl.replace(/\/+$/, '')}/${relativeUrl.replace(/^\/+/, '')}`,
    requestHeaders: { 'X-Emby-Token': context.accessToken },
    container: source.Container,
    videoCodec: source.MediaStreams.find((stream) => stream.Type === 'Video')?.Codec ?? 'unknown',
    audioCodec: source.MediaStreams.find((stream) => stream.Type === 'Audio')?.Codec ?? null,
    bitrate: source.Bitrate ?? null,
    durationSeconds: (source.RunTimeTicks ?? 0) / 10_000_000,
    method: direct ? 'direct-play' : 'direct-stream',
    startPositionSeconds: 0,
  }
}
```

`stripCredentialQuery` must remove `api_key`, `token`, and `X-Emby-Token` case-insensitively while preserving non-secret remux parameters.

- [x] **Step 3: Write failing playback failover tests**

```ts
// packages/core/src/playback/playback-service.test.ts
it('regenerates the plan on the backup line when mpv cannot load the primary', async () => {
  adapter.getPlaybackPlan.mockImplementation(async (_itemId, context) => planFor(context.line))
  player.play
    .mockRejectedValueOnce(new AppError('PlaybackFailed', 'network load failed'))
    .mockResolvedValueOnce(undefined)
  const result = await service.play('profile-1', 'item-1')
  expect(adapter.getPlaybackPlan.mock.calls.map(([, context]) => context.line.id))
    .toEqual(['line-primary', 'line-backup'])
  expect(player.stop).toHaveBeenCalledTimes(1)
  expect(result.lineId).toBe('line-backup')
})

it('does not try another line for MediaNotDirectPlayable', async () => {
  adapter.getPlaybackPlan.mockRejectedValue(
    new AppError('MediaNotDirectPlayable', 'transcode required'),
  )
  await expect(service.play('profile-1', 'item-1')).rejects.toMatchObject({
    code: 'MediaNotDirectPlayable',
  })
  expect(adapter.getPlaybackPlan).toHaveBeenCalledTimes(1)
  expect(player.play).not.toHaveBeenCalled()
})
```

Run: `pnpm vitest run packages/core/src/playback/playback-service.test.ts`

Expected: FAIL because `PlaybackService` is missing.

- [x] **Step 4: Implement pre-start playback failover**

```ts
// packages/core/src/playback/playback-service.ts
export class PlaybackService {
  constructor(
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
    private readonly routes: RouteExecutor,
    private readonly adapterFor: (kind: ServerKind) => Pick<MediaServerAdapter, 'getPlaybackPlan'>,
    private readonly player: PlayerEngine,
  ) {}

  async play(
    profileId: string,
    itemId: string,
    startPositionSeconds = 0,
  ): Promise<{ plan: PlaybackPlan; lineId: string }> {
    const profile = await requireProfile(this.storage, profileId)
    const accessToken = await requireCredential(this.credentials, profile.credentialKey)
    return this.routes.execute(profile, async (line) => {
      const receivedPlan = await this.adapterFor(profile.kind).getPlaybackPlan(itemId, {
        profileId,
        line,
        userId: profile.userId,
        accessToken,
      })
      const plan = { ...receivedPlan, startPositionSeconds }
      try {
        await this.player.play(plan)
        return { plan, lineId: line.id }
      } catch (error) {
        await this.player.stop().catch(() => undefined)
        if (isPreStartNetworkFailure(error)) throw new AppError('NetworkUnavailable', 'Playback line failed', error)
        throw error
      }
    }).then(({ value }) => value)
  }
}
```

`isPreStartNetworkFailure` only accepts native load timeout, connection, DNS, or HTTP `502/503/504`; it must reject codec, mpv-unavailable, `401/403`, and media capability failures. Once a `started` event is received, this service does not auto-switch.

- [x] **Step 5: Write failing player-store and detail action tests**

```ts
// apps/desktop/src/stores/player-store.test.ts
it('exposes play state and forwards pause seek resume stop', async () => {
  const store = createPlayerStoreHarness()
  await store.play('profile-1', 'item-1')
  emitPlayer({ type: 'started', positionSeconds: 0, durationSeconds: 120 })
  expect(store.state).toBe('playing')
  await store.pause()
  await store.seek(30)
  await store.resume()
  await store.stop()
  expect(engine.pause).toHaveBeenCalled()
  expect(engine.seek).toHaveBeenCalledWith(30)
  expect(engine.resume).toHaveBeenCalled()
  expect(engine.stop).toHaveBeenCalled()
})
```

Run: `pnpm vitest run apps/desktop/src/stores/player-store.test.ts apps/desktop/src/views/MediaDetailView.test.ts`

Expected: FAIL because player state/actions and detail play wiring are absent.

- [x] **Step 6: Implement play/resume actions and basic controls**

```ts
// apps/desktop/src/stores/player-store.ts
export const usePlayerStore = defineStore('player', () => {
  const state = ref<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle')
  const positionSeconds = ref(0)
  const durationSeconds = ref(0)
  const activePlan = shallowRef<PlaybackPlan | null>(null)

  services.player.subscribe((event) => {
    if (event.type === 'started' || event.type === 'position'
      || event.type === 'paused' || event.type === 'resumed' || event.type === 'seeked') {
      positionSeconds.value = event.positionSeconds
      durationSeconds.value = event.durationSeconds
    }
    if (event.type === 'started' || event.type === 'resumed') state.value = 'playing'
    if (event.type === 'paused') state.value = 'paused'
    if (event.type === 'ended' || event.type === 'stopped') state.value = 'idle'
    if (event.type === 'error') state.value = 'error'
  })

  async function play(
    profileId: string,
    itemId: string,
    startPositionSeconds = 0,
  ): Promise<void> {
    state.value = 'loading'
    const result = await services.playback.play(profileId, itemId, startPositionSeconds)
    activePlan.value = result.plan
  }

  return {
    state, positionSeconds, durationSeconds, activePlan, play,
    pause: () => services.player.pause(),
    resume: () => services.player.resume(),
    seek: (seconds: number) => services.player.seek(seconds),
    stop: () => services.player.stop(),
  }
})
```

The detail Play action passes zero; Resume passes the item's `playbackPositionSeconds` to `playerStore.play` so the plan is adjusted before the first native `player.play` call.

- [x] **Step 7: Verify playback planning and startup retry**

Run:

```bash
pnpm vitest run packages/core/src/adapters/{emby,jellyfin}/*.test.ts packages/core/src/playback/playback-service.test.ts apps/desktop/src/stores/player-store.test.ts apps/desktop/src/views/MediaDetailView.test.ts
pnpm typecheck
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mpv
```

Expected: direct-play/remux tests pass; transcode-only fails clearly; startup retry regenerates a plan on backup; controls remain operational.

- [ ] **Step 8: Commit direct playback**

```bash
git add packages/core/src/adapters packages/core/src/playback/playback-service.ts packages/core/src/playback/playback-service.test.ts tests/fixtures/emby/playback-info.json tests/fixtures/jellyfin/playback-info.json apps/desktop/src/stores/player-store.ts apps/desktop/src/stores/player-store.test.ts apps/desktop/src/components/PlayerControls.vue apps/desktop/src/views/MediaDetailView.vue apps/desktop/src/views/MediaDetailView.test.ts
git commit -m "feat: start direct playback with line retry"
```

## Task 10: 播放状态与十秒进度同步

**可独立验收：** mpv 确认加载后上报 Started；播放每 10 秒、暂停、恢复、跳转立即上报；停止、正常结束和应用关闭上报 Stopped；上报失败不会打断本地播放且最多按 `1s/2s/4s` 重试。

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/ports/clock.ts`
- Create: `packages/core/src/playback/ticks.ts`
- Test: `packages/core/src/playback/ticks.test.ts`
- Create: `packages/core/src/playback/progress-reporter.ts`
- Test: `packages/core/src/playback/progress-reporter.test.ts`
- Modify: `packages/core/src/media/media-server-adapter.ts`
- Modify: `packages/core/src/media/media-service.ts`
- Modify: `packages/core/src/media/media-service.test.ts`
- Modify: `packages/core/src/adapters/emby/emby-adapter.ts`
- Modify: `packages/core/src/adapters/emby/emby-adapter.test.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-adapter.ts`
- Modify: `packages/core/src/adapters/jellyfin/jellyfin-adapter.test.ts`
- Modify: `apps/desktop/src/stores/player-store.ts`
- Modify: `apps/desktop/src/stores/player-store.test.ts`
- Modify: `apps/desktop/src/composition/create-services.ts`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: canonical `Clock`, `PlayerEngine`, `PlayerEvent`, `PlaybackPlan`, `PlaybackReport`, `MediaServerAdapter.reportPlayback`.
- Produces: `secondsToTicks(seconds): number`; `ticksToSeconds(ticks): number`; `ProgressReporter.start(plan, report)`, `.handle(event)`, `.whenIdle()`, `.flushAndStop(reason)`.

- [x] **Step 1: Write failing exact tick-conversion tests**

```ts
// packages/core/src/playback/ticks.test.ts
import { describe, expect, it } from 'vitest'
import { secondsToTicks, ticksToSeconds } from './ticks'

describe('playback time conversion', () => {
  it.each([
    [0, 0],
    [0.5, 5_000_000],
    [1, 10_000_000],
    [123.456789, 1_234_567_890],
  ])('converts %s seconds to %s ticks', (seconds, ticks) => {
    expect(secondsToTicks(seconds)).toBe(ticks)
    expect(ticksToSeconds(ticks)).toBeCloseTo(seconds, 7)
  })

  it('clamps negative and non-finite positions to zero', () => {
    expect(secondsToTicks(-1)).toBe(0)
    expect(secondsToTicks(Number.NaN)).toBe(0)
  })
})
```

- [x] **Step 2: Run tick tests to verify the red state**

Run: `pnpm vitest run packages/core/src/playback/ticks.test.ts`

Expected: FAIL because conversion functions are missing.

- [x] **Step 3: Implement deterministic tick conversion**

```ts
// packages/core/src/playback/ticks.ts
const TICKS_PER_SECOND = 10_000_000

export function secondsToTicks(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.round(seconds * TICKS_PER_SECOND)
}

export function ticksToSeconds(ticks: number): number {
  if (!Number.isFinite(ticks) || ticks <= 0) return 0
  return ticks / TICKS_PER_SECOND
}
```

- [x] **Step 4: Write failing reporter timing, coalescing, and retry tests**

```ts
// packages/core/src/playback/progress-reporter.test.ts
it('reports started, ten-second progress, pause, seek, and stopped serially', async () => {
  const harness = createReporterHarness()
  harness.reporter.start(plan, harness.send)
  await harness.reporter.handle({ type: 'started', positionSeconds: 0, durationSeconds: 120 })
  await harness.reporter.whenIdle()
  await harness.clock.advanceBy(9_999)
  expect(harness.types()).toEqual(['started'])
  await harness.clock.advanceBy(1)
  await harness.reporter.whenIdle()
  expect(harness.types()).toEqual(['started', 'progress'])
  await harness.reporter.handle({ type: 'paused', positionSeconds: 12, durationSeconds: 120 })
  await harness.reporter.handle({ type: 'seeked', positionSeconds: 50, durationSeconds: 120 })
  await harness.reporter.flushAndStop('user')
  expect(harness.types()).toEqual(['started', 'progress', 'paused', 'seeked', 'stopped'])
  expect(harness.maxInFlight()).toBe(1)
})

it('retries at one, two, and four seconds without rejecting playback', async () => {
  const harness = createReporterHarness({ failures: 3 })
  harness.reporter.start(plan, harness.send)
  await harness.reporter.handle({
    type: 'started', positionSeconds: 0, durationSeconds: 120,
  })
  await harness.clock.runAll()
  await harness.reporter.whenIdle()
  expect(harness.attemptTimes()).toEqual([0, 1_000, 3_000, 7_000])
})

it('coalesces pending periodic progress to the newest position', async () => {
  const harness = createReporterHarness({ blocked: true })
  harness.reporter.start(plan, harness.send)
  await harness.reporter.handle({ type: 'position', positionSeconds: 10, durationSeconds: 120 })
  await harness.reporter.handle({ type: 'position', positionSeconds: 20, durationSeconds: 120 })
  harness.release()
  await harness.clock.runAll()
  expect(harness.progressPositions().at(-1)).toBe(20 * 10_000_000)
})
```

Run: `pnpm vitest run packages/core/src/playback/progress-reporter.test.ts`

Expected: FAIL because `ProgressReporter` is missing.

- [x] **Step 5: Implement serialized reporting with bounded retry**

```ts
// packages/core/src/playback/progress-reporter.ts
const PROGRESS_INTERVAL_MS = 10_000
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const

export class ProgressReporter {
  private plan: PlaybackPlan | null = null
  private send: ((report: PlaybackReport) => Promise<void>) | null = null
  private latest = { positionSeconds: 0, isPaused: false }
  private timer: TimerHandle | null = null
  private queue: Promise<void> = Promise.resolve()
  private stopped = false
  private startedReported = false

  constructor(private readonly clock: Clock, private readonly logger: Logger) {}

  start(plan: PlaybackPlan, send: (report: PlaybackReport) => Promise<void>): void {
    this.plan = plan
    this.send = send
    this.latest = { positionSeconds: plan.startPositionSeconds, isPaused: false }
    this.stopped = false
    this.startedReported = false
  }

  handle(event: PlayerEvent): Promise<void> {
    if (!this.plan || this.stopped || event.type === 'error') return Promise.resolve()
    this.latest.positionSeconds = event.positionSeconds
    if (event.type === 'paused') this.latest.isPaused = true
    if (event.type === 'resumed' || event.type === 'started') this.latest.isPaused = false
    if (event.type === 'started' && !this.startedReported) {
      this.startedReported = true
      this.enqueue('started')
      this.scheduleProgress()
    } else if (event.type === 'paused' || event.type === 'resumed' || event.type === 'seeked') {
      this.enqueue(event.type)
    } else if (event.type === 'ended' || event.type === 'stopped') {
      return this.flushAndStop(event.type === 'ended' ? 'ended' : 'user')
    }
    return Promise.resolve()
  }

  whenIdle(): Promise<void> {
    return this.queue
  }

  async flushAndStop(_reason: 'ended' | 'user' | 'app-exit'): Promise<void> {
    if (!this.plan || this.stopped) return
    this.stopped = true
    if (this.timer) this.clock.clearTimeout(this.timer)
    this.enqueue('stopped')
    await this.queue
  }

  private scheduleProgress(): void {
    this.timer = this.clock.setTimeout(() => {
      if (this.stopped) return
      this.enqueue('progress')
      this.scheduleProgress()
    }, PROGRESS_INTERVAL_MS)
  }

  private enqueue(type: PlaybackReportType): void {
    const report = this.makeReport(type)
    this.queue = this.queue.then(() => this.sendWithRetry(report))
  }

  private makeReport(type: PlaybackReportType): PlaybackReport {
    const plan = this.plan!
    return {
      type,
      itemId: plan.itemId,
      mediaSourceId: plan.mediaSourceId,
      playSessionId: plan.playSessionId,
      positionTicks: secondsToTicks(this.latest.positionSeconds),
      isPaused: this.latest.isPaused,
    }
  }

  private async sendWithRetry(report: PlaybackReport): Promise<void> {
    for (const delayMs of [0, ...RETRY_DELAYS_MS]) {
      if (delayMs) await delay(this.clock, delayMs)
      try {
        await this.send!(report)
        return
      } catch (error) {
        this.logger.warn('Playback report failed', { type: report.type, error })
      }
    }
  }
}
```

- [x] **Step 6: Write failing provider report contract tests**

```ts
// added to each provider adapter test
it.each([
  ['started', '/Sessions/Playing'],
  ['progress', '/Sessions/Playing/Progress'],
  ['paused', '/Sessions/Playing/Progress'],
  ['resumed', '/Sessions/Playing/Progress'],
  ['seeked', '/Sessions/Playing/Progress'],
  ['stopped', '/Sessions/Playing/Stopped'],
])('maps %s to %s without credentials in payload', async (type, path) => {
  await adapter.reportPlayback({
    type,
    itemId: 'item-1',
    mediaSourceId: 'source-1',
    playSessionId: 'play-1',
    positionTicks: 100_000_000,
    isPaused: type === 'paused',
  }, context)
  expect(transport.lastRequest()).toMatchObject({
    path,
    method: 'POST',
    body: expect.objectContaining({
      ItemId: 'item-1',
      PositionTicks: 100_000_000,
    }),
  })
  expect(JSON.stringify(transport.lastRequest().body)).not.toContain(context.accessToken)
})
```

Run: `pnpm vitest run packages/core/src/adapters/{emby,jellyfin}/*.test.ts -t maps`

Expected: FAIL because progress endpoints are not implemented.

- [x] **Step 7: Implement provider progress reporting and complete the unified adapters**

```ts
// method added to both provider adapters
async reportPlayback(event: PlaybackReport, context: RequestContext): Promise<void> {
  const path = event.type === 'started'
    ? '/Sessions/Playing'
    : event.type === 'stopped'
      ? '/Sessions/Playing/Stopped'
      : '/Sessions/Playing/Progress'
  await this.authorizedRequest(context, {
    path,
    method: 'POST',
    body: {
      ItemId: event.itemId,
      MediaSourceId: event.mediaSourceId,
      PlaySessionId: event.playSessionId,
      PositionTicks: event.positionTicks,
      IsPaused: event.isPaused,
      CanSeek: true,
    },
  })
}
```

At this point declare both `EmbyAdapter` and `JellyfinAdapter` as implementing the complete canonical `MediaServerAdapter`; typecheck must prove all seven methods exist.

```ts
// method added to packages/core/src/media/media-service.ts
reportPlayback(
  profileId: string,
  event: PlaybackReport,
  signal?: AbortSignal,
): Promise<void> {
  return this.execute(
    profileId,
    (adapter, context) => adapter.reportPlayback(event, context),
    signal,
  ).then(() => undefined)
}
```

Update `MediaService.adapterFor` and its private callback type from `MediaBrowseAdapter` to the now-complete `MediaServerAdapter`; add a unit test proving report failures use the same sequential route classification and never overlap attempts.

- [x] **Step 8: Wire player events and app shutdown**

```ts
// additions to apps/desktop/src/stores/player-store.ts
services.player.subscribe((event) => {
  void reporter.handle(event)
})

async function play(profileId: string, itemId: string): Promise<void> {
  state.value = 'loading'
  const result = await services.playback.play(profileId, itemId, 0)
  activePlan.value = result.plan
  reporter.start(result.plan, (report) =>
    services.media.reportPlayback(profileId, report),
  )
  await reporter.handle({
    type: 'started',
    positionSeconds: result.plan.startPositionSeconds,
    durationSeconds: result.plan.durationSeconds,
  })
}

async function shutdown(): Promise<void> {
  await reporter.flushAndStop('app-exit')
  await services.player.stop()
}
```

Register one Tauri close-request handler that awaits `shutdown()` with a 2-second ceiling, then permits exit. A timed-out final report is logged after redaction and does not keep the process alive.

- [x] **Step 9: Verify progress semantics**

Run:

```bash
pnpm vitest run packages/core/src/playback packages/core/src/adapters/{emby,jellyfin}/*.test.ts apps/desktop/src/stores/player-store.test.ts
pnpm typecheck
```

Expected: ticks, cadence, immediate events, serial delivery, coalescing, bounded retry, and shutdown stop tests pass; adapters satisfy `MediaServerAdapter`.

- [ ] **Step 10: Commit progress synchronization**

```bash
git add packages/core/src/ports/clock.ts packages/core/src/playback packages/core/src/media/media-server-adapter.ts packages/core/src/media/media-service.ts packages/core/src/media/media-service.test.ts packages/core/src/adapters apps/desktop/src/stores/player-store.ts apps/desktop/src/stores/player-store.test.ts apps/desktop/src/composition/create-services.ts apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: synchronize playback progress"
```

## Task 11: 大型媒体库性能与请求生命周期

**可独立验收：** 10,000 项合成库只渲染可视窗口，页面每次从服务端取 60 项，图片懒加载且 Token 不入 URL；缓存按服务器隔离，切服/离页会取消请求并释放 Blob URL。

**Files:**
- Create: `apps/desktop/src/queries/query-client.ts`
- Create: `apps/desktop/src/queries/query-keys.ts`
- Test: `apps/desktop/src/queries/query-keys.test.ts`
- Create: `apps/desktop/src/queries/use-library-items.ts`
- Create: `apps/desktop/src/queries/use-secure-image.ts`
- Create: `apps/desktop/src/platform/images/secure-image-loader.ts`
- Test: `apps/desktop/src/platform/images/secure-image-loader.test.ts`
- Create: `apps/desktop/src/components/VirtualPosterGrid.vue`
- Test: `apps/desktop/src/components/VirtualPosterGrid.test.ts`
- Modify: `apps/desktop/src/components/MediaCard.vue`
- Modify: `apps/desktop/src/views/HomeView.vue`
- Modify: `apps/desktop/src/views/LibraryView.vue`
- Modify: `apps/desktop/src/views/SearchView.vue`
- Modify: `apps/desktop/src/stores/app-store.ts`
- Modify: `apps/desktop/src/platform/http/tauri-http-transport.ts`
- Modify: `packages/core/src/ports/http-transport.ts`
- Modify: `packages/core/src/media/media-service.ts`

**Interfaces:**
- Consumes: `MediaService`, `HttpTransport`, `RouteExecutor`, `StoragePort`, `CredentialStore`, `AbortSignal`.
- Produces: `mediaKeys.items(serverId, query)`, `useLibraryItems(serverId, query)`, `SecureImageLoader.load(profileId, itemId, imageTag, signal): Promise<string>`.

- [x] **Step 1: Write failing server-isolated query-key and cancellation tests**

```ts
// apps/desktop/src/queries/query-keys.test.ts
it('isolates identical item queries by logical server', () => {
  const query = { libraryId: 'lib', startIndex: 0, limit: 60, kinds: ['movie'] as const }
  expect(mediaKeys.items('profile-1', query))
    .not.toEqual(mediaKeys.items('profile-2', query))
})
```

```ts
// addition to apps/desktop/src/stores/app-store.test.ts
it('aborts old-server queries before publishing the new server', async () => {
  await store.selectServer('profile-2')
  expect(queryClient.cancelQueries).toHaveBeenCalled()
  expect(storage.savePreferences.mock.invocationCallOrder[0])
    .toBeLessThan(publishActiveServer.mock.invocationCallOrder[0])
})
```

Run: `pnpm vitest run apps/desktop/src/queries apps/desktop/src/stores/app-store.test.ts`

Expected: FAIL because query keys/client are missing.

- [x] **Step 2: Implement bounded remote cache and abort propagation**

```ts
// apps/desktop/src/queries/query-client.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})
```

```ts
// apps/desktop/src/queries/query-keys.ts
export const mediaKeys = {
  root: (serverId: string) => ['media', serverId] as const,
  items: (serverId: string, query: ItemQuery) =>
    ['media', serverId, 'items', structuredClone(query)] as const,
  image: (serverId: string, itemId: string, imageTag: string | null) =>
    ['media', serverId, 'image', itemId, imageTag] as const,
}
```

```ts
// apps/desktop/src/queries/use-library-items.ts
export function useLibraryItems(serverId: Ref<string>, query: Ref<ItemQuery>) {
  return useInfiniteQuery({
    queryKey: computed(() => mediaKeys.items(serverId.value, query.value)),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => services.media.getItems(serverId.value, {
      ...query.value,
      startIndex: pageParam,
      limit: 60,
    }, signal).then((result) => result.value),
    getNextPageParam: (lastPage) => {
      const next = lastPage.startIndex + lastPage.items.length
      return next < lastPage.total ? next : undefined
    },
  })
}
```

Do not persist this cache to SQLite; only `activeLibraryIdByServer` is durable.

- [x] **Step 3: Write failing secure-image tests**

```ts
// apps/desktop/src/platform/images/secure-image-loader.test.ts
it('loads an image with a header token and returns a revocable Blob URL', async () => {
  const url = await loader.load('profile-1', 'item-1', 'tag-1', signal)
  expect(http.request).toHaveBeenCalledWith(expect.objectContaining({
    baseUrl: 'https://saved.example',
    path: '/Items/item-1/Images/Primary',
    query: { tag: 'tag-1', maxWidth: 400 },
    headers: { 'X-Emby-Token': 'secret-token' },
    responseType: 'bytes',
  }))
  expect(JSON.stringify(http.request.mock.calls[0][0].query)).not.toContain('secret-token')
  expect(url).toBe('blob:lumaroute-image')
  loader.release(url)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
})
```

Run: `pnpm vitest run apps/desktop/src/platform/images/secure-image-loader.test.ts`

Expected: FAIL because binary transport and image loader are missing.

- [x] **Step 4: Add binary HTTP responses and secure image loading**

```ts
// addition to packages/core/src/ports/http-transport.ts
export interface HttpRequest {
  baseUrl: string
  path: `/${string}`
  method: 'GET' | 'POST' | 'DELETE'
  query?: Readonly<Record<string, string | number | boolean | undefined>>
  headers?: Readonly<Record<string, string>>
  body?: unknown
  signal?: AbortSignal
  timeoutMs: number
  responseType?: 'json' | 'bytes'
}
```

```ts
// apps/desktop/src/platform/images/secure-image-loader.ts
export class SecureImageLoader {
  constructor(
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
    private readonly routes: RouteExecutor,
    private readonly http: HttpTransport,
  ) {}

  async load(
    profileId: string,
    itemId: string,
    imageTag: string | null,
    signal?: AbortSignal,
  ): Promise<string> {
    const profile = await requireProfile(this.storage, profileId)
    const token = await requireCredential(this.credentials, profile.credentialKey)
    const { value } = await this.routes.execute(profile, async (line) => {
      const response = await this.http.request<Uint8Array>({
        baseUrl: line.baseUrl,
        path: `/Items/${encodeURIComponent(itemId)}/Images/Primary`,
        method: 'GET',
        query: { tag: imageTag ?? undefined, maxWidth: 400 },
        headers: { 'X-Emby-Token': token },
        signal,
        timeoutMs: 10_000,
        responseType: 'bytes',
      })
      return response.data
    }, signal)
    return URL.createObjectURL(new Blob([value]))
  }

  release(url: string): void {
    URL.revokeObjectURL(url)
  }
}
```

Update `TauriHttpTransport` to call `response.arrayBuffer()` for `bytes` and `response.json()` for `json`/undefined. Preserve manual redirect rejection for both.

- [x] **Step 5: Write failing virtual-grid performance test**

```ts
// apps/desktop/src/components/VirtualPosterGrid.test.ts
it('keeps DOM nodes bounded for ten thousand logical items', async () => {
  const items = Array.from({ length: 10_000 }, (_, index) => ({
    ...movie,
    id: `item-${index}`,
    name: `Movie ${index}`,
  }))
  const wrapper = mount(VirtualPosterGrid, {
    props: { items, estimateSize: 260, overscan: 3 },
    attachTo: document.body,
  })
  await nextTick()
  expect(wrapper.findAll('[data-testid="media-card"]').length).toBeLessThanOrEqual(150)
})

it('requests the next server page near the viewport end', async () => {
  const loadNext = vi.fn()
  const wrapper = mountGrid({ itemCount: 60, hasNextPage: true, loadNext })
  await scrollToEnd(wrapper)
  expect(loadNext).toHaveBeenCalledTimes(1)
})
```

Run: `pnpm vitest run apps/desktop/src/components/VirtualPosterGrid.test.ts`

Expected: FAIL because the virtual grid is missing.

- [x] **Step 6: Implement virtualized poster rendering and lazy image cleanup**

```vue
<!-- essential structure in apps/desktop/src/components/VirtualPosterGrid.vue -->
<template>
  <div ref="scrollElement" class="poster-scroll">
    <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
      <MediaCard
        v-for="row in virtualizer.getVirtualItems()"
        :key="items[row.index].id"
        :item="items[row.index]"
        data-testid="media-card"
        :style="{ position: 'absolute', transform: `translateY(${row.start}px)` }"
      />
    </div>
  </div>
</template>
```

```ts
// apps/desktop/src/queries/use-secure-image.ts
export function useSecureImage(
  profileId: Ref<string>,
  item: Ref<MediaItem>,
): Readonly<Ref<string | null>> {
  const source = ref<string | null>(null)
  let controller: AbortController | null = null
  watch([profileId, () => item.value.id, () => item.value.imageTag], async () => {
    controller?.abort()
    if (source.value) services.images.release(source.value)
    controller = new AbortController()
    source.value = await services.images.load(
      profileId.value,
      item.value.id,
      item.value.imageTag,
      controller.signal,
    )
  }, { immediate: true })
  onScopeDispose(() => {
    controller?.abort()
    if (source.value) services.images.release(source.value)
  })
  return readonly(source)
}
```

Install `@tanstack/vue-query` and `@tanstack/vue-virtual`; render an IntersectionObserver-backed image placeholder until the card is near the viewport.

Run: `pnpm --filter @lumaroute/desktop add @tanstack/vue-query @tanstack/vue-virtual`

Expected: both packages are locked; no persistent-query plugin is installed.

- [x] **Step 7: Verify performance and lifecycle**

Run:

```bash
pnpm vitest run apps/desktop/src/queries apps/desktop/src/platform/images/secure-image-loader.test.ts apps/desktop/src/components/VirtualPosterGrid.test.ts apps/desktop/src/stores/app-store.test.ts
pnpm typecheck
```

Expected: 10,000 logical items produce at most 150 cards; paging remains 60; old-server requests abort; Blob URLs are revoked; no image URL contains Token.

- [ ] **Step 8: Commit large-library behavior**

```bash
git add packages/core/src/ports/http-transport.ts packages/core/src/media/media-service.ts apps/desktop/src/queries apps/desktop/src/platform/images apps/desktop/src/platform/http/tauri-http-transport.ts apps/desktop/src/components/VirtualPosterGrid.vue apps/desktop/src/components/VirtualPosterGrid.test.ts apps/desktop/src/components/MediaCard.vue apps/desktop/src/views/HomeView.vue apps/desktop/src/views/LibraryView.vue apps/desktop/src/views/SearchView.vue apps/desktop/src/stores/app-store.ts package.json pnpm-lock.yaml apps/desktop/package.json
git commit -m "perf: virtualize and isolate large media libraries"
```

## Task 12: 集中脱敏、诊断与安全回归门

**可独立验收：** 结构化日志、错误和复制出的诊断信息不含 Token、密码、认证参数/请求头或用户标记敏感地址；自动扫描会在泄漏样例出现时失败。

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/ports/logger.ts`
- Create: `packages/core/src/logging/redact.ts`
- Test: `packages/core/src/logging/redact.test.ts`
- Create: `packages/core/src/logging/diagnostic-service.ts`
- Test: `packages/core/src/logging/diagnostic-service.test.ts`
- Create: `apps/desktop/src/components/DiagnosticPanel.vue`
- Modify: `apps/desktop/src/views/ServerSettingsView.vue`
- Modify: `apps/desktop/src/stores/server-store.ts`
- Create: `scripts/check-boundaries.mjs`
- Create: `scripts/check-sensitive-output.mjs`
- Modify: `package.json`
- Modify: `apps/desktop/src-tauri/capabilities/default.json`
- Modify: `apps/desktop/src-tauri/src/error.rs`

**Interfaces:**
- Consumes: canonical `Logger`, `AppPreferences.sensitiveLineIds`, saved `ServerProfile[]`.
- Produces: `redact(value, policy): unknown`; `DiagnosticService.copyableReport(): string`; commands `check:boundaries`, `check:sensitive`.

- [x] **Step 1: Write failing recursive redaction tests**

```ts
// packages/core/src/logging/redact.test.ts
it('redacts nested credentials, auth query values, headers, and marked origins', () => {
  const input = {
    password: 'plain-password',
    accessToken: 'access-token',
    request: {
      url: 'https://private.example/Items?api_key=query-token&safe=value',
      headers: {
        Authorization: 'Bearer auth-token',
        'X-Emby-Token': 'emby-token',
        Accept: 'application/json',
      },
    },
  }
  const output = JSON.stringify(redact(input, {
    sensitiveOrigins: ['https://private.example'],
  }))
  for (const secret of [
    'plain-password', 'access-token', 'query-token',
    'auth-token', 'emby-token', 'private.example',
  ]) {
    expect(output).not.toContain(secret)
  }
  expect(output).toContain('safe=value')
  expect(output).toContain('application/json')
})

it('handles arrays, Error causes, cycles, and case-insensitive keys', () => {
  const value: Record<string, unknown> = { ToKeN: 'secret' }
  value.self = value
  expect(() => redact(value, { sensitiveOrigins: [] })).not.toThrow()
  expect(JSON.stringify(redact(value, { sensitiveOrigins: [] }))).not.toContain('secret')
})
```

- [x] **Step 2: Run redaction tests to verify the red state**

Run: `pnpm vitest run packages/core/src/logging/redact.test.ts`

Expected: FAIL because centralized redaction is missing.

- [x] **Step 3: Implement centralized redaction**

```ts
// packages/core/src/logging/redact.ts
const SECRET_KEYS = /^(password|pw|token|access.?token|api.?key|authorization|x-emby-token)$/i
const SECRET_QUERY_KEYS = new Set(['api_key', 'token', 'access_token', 'x-emby-token'])

export interface RedactionPolicy {
  sensitiveOrigins: readonly string[]
}

export function redact(
  value: unknown,
  policy: RedactionPolicy,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'string') return redactString(value, policy)
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message, policy),
      cause: redact(value.cause, policy, seen),
    }
  }
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((entry) => redact(entry, policy, seen))
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SECRET_KEYS.test(key) ? '[REDACTED]' : redact(entry, policy, seen),
  ]))
}

function redactString(value: string, policy: RedactionPolicy): string {
  let output = value
  for (const origin of policy.sensitiveOrigins) output = output.replaceAll(origin, '[PRIVATE_SERVER]')
  try {
    const url = new URL(output)
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.set(key, '[REDACTED]')
    }
    return url.toString()
  } catch {
    return output
  }
}
```

All logger implementations must call `redact` before writing to console, ring buffer, test sink, native event, or clipboard.

- [x] **Step 4: Write failing diagnostic report tests**

```ts
// packages/core/src/logging/diagnostic-service.test.ts
it('copies actionable codes and platform data without private fields', () => {
  const service = createDiagnosticService({
    sensitiveLineIds: ['line-private'],
    profiles: [profileWithPrivateLine],
    records: [{
      level: 'error',
      message: 'request failed',
      context: { token: 'secret', baseUrl: 'https://private.example' },
    }],
  })
  const report = service.copyableReport()
  expect(report).toContain('NetworkUnavailable')
  expect(report).toContain('darwin')
  expect(report).not.toContain('secret')
  expect(report).not.toContain('private.example')
})
```

Run: `pnpm vitest run packages/core/src/logging/diagnostic-service.test.ts`

Expected: FAIL because the diagnostic service is missing.

- [x] **Step 5: Implement copy-safe diagnostics and sensitive-line UI**

```ts
// packages/core/src/logging/diagnostic-service.ts
export class DiagnosticService {
  constructor(
    private readonly records: () => readonly DiagnosticRecord[],
    private readonly policy: () => RedactionPolicy,
    private readonly environment: () => DiagnosticEnvironment,
  ) {}

  copyableReport(): string {
    return JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      environment: this.environment(),
      records: redact(this.records().slice(-200), this.policy()),
    }, null, 2)
  }
}
```

Add a per-line “Hide address in diagnostics” checkbox that only updates `AppPreferences.sensitiveLineIds`. `DiagnosticPanel.vue` displays error code, user action (`switch line`, `sign in again`, or `copy diagnostics`), and the already-redacted report.

- [x] **Step 6: Create boundary and sensitive-output scanners**

```js
// scripts/check-boundaries.mjs
import { execFileSync } from 'node:child_process'

const forbidden = [
  ['packages/core', String.raw`from ['"](?:vue|pinia|@tauri-apps/|.*apps/desktop)`],
  ['packages/player', String.raw`from ['"](?:vue|pinia|@tauri-apps/|@lumaroute/core|.*apps/desktop)`],
]

for (const [path, pattern] of forbidden) {
  try {
    execFileSync('rg', ['-n', pattern, path], { stdio: 'inherit' })
    process.exitCode = 1
  } catch (error) {
    if (error.status !== 1) throw error
  }
}
```

```js
// scripts/check-sensitive-output.mjs
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
const forbidden = [
  /Bearer\s+[A-Za-z0-9._~-]{8,}/i,
  /(?:api_key|access_token|x-emby-token)=([^&\s[\]"]+)/i,
  /"(?:password|accessToken|token)"\s*:\s*"(?!\[REDACTED\])/i,
]
const findings = files.flatMap((file) => {
  const text = readFileSync(file, 'utf8')
  return forbidden.flatMap((pattern) => pattern.test(text) ? [`${file}: ${pattern}`] : [])
})
if (findings.length) {
  console.error(findings.join('\n'))
  process.exit(1)
}
```

Add `check:boundaries` and `check:sensitive` to root scripts and include them in `pnpm check`. Scanner input in CI is test logs, packaged startup logs, generated diagnostics, and repository fixtures—not source files containing deliberate redaction test literals.

- [x] **Step 7: Tighten native capabilities and error serialization**

```json
// apps/desktop/src-tauri/capabilities/default.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Minimum LumaRoute desktop permissions",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "http:default",
    "sql:default"
  ]
}
```

The invoke handler exposes only health, credential, and five player commands. `NativeError` serialization returns `{ code, message }`, strips causes, paths, command lines, request headers, and keyring values.

- [x] **Step 8: Verify security regressions**

Run:

```bash
pnpm vitest run packages/core/src/logging apps/desktop/src/platform/http apps/desktop/src/platform/credentials apps/desktop/src/platform/images
pnpm check:boundaries
pnpm check:sensitive -- test-results/diagnostics.json test-results/app.log
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml credential mpv
```

Expected: redaction tests pass; scanner prints no findings; core/player boundary scan exits 0; Rust tests expose no secret.

- [ ] **Step 9: Commit centralized security controls**

```bash
git add packages/core/src/ports/logger.ts packages/core/src/logging apps/desktop/src/components/DiagnosticPanel.vue apps/desktop/src/views/ServerSettingsView.vue apps/desktop/src/stores/server-store.ts scripts/check-boundaries.mjs scripts/check-sensitive-output.mjs package.json apps/desktop/src-tauri/capabilities/default.json apps/desktop/src-tauri/src/error.rs
git commit -m "feat: centralize redaction and diagnostics"
```

## Task 13: 三平台 mpv 固定、CI 与安装包

**可独立验收：** 经真实兼容性测试的 mpv 构建被版本/来源/SHA-256 固定；CI 在 Windows x64、macOS Intel/Apple Silicon、Linux x64 构建约定安装包、执行启动冒烟并生成校验文件；开发构建明确标记未签名。

**Files:**
- Create: `apps/desktop/src-tauri/resources/mpv/mpv.lock.json`
- Create: `apps/desktop/src-tauri/resources/third-party/mpv-LICENSE.txt`
- Create: `apps/desktop/src-tauri/resources/third-party/ffmpeg-LICENSE.txt`
- Create: `tests/fixtures/media/samples.lock.json`
- Create: `docs/release/third-party-sources.md`
- Create: `scripts/fetch-mpv.mjs`
- Create: `scripts/verify-mpv.mjs`
- Create: `scripts/verify-mpv.test.mjs`
- Create: `scripts/package-checksums.mjs`
- Create: `scripts/smoke-packaged.mjs`
- Create: `.github/workflows/quality.yml`
- Create: `.github/workflows/package.yml`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`
- Modify: `apps/desktop/src-tauri/src/mpv/process.rs`
- Modify: `package.json`

**Interfaces:**
- Consumes: validated mpv archives, platform resource resolver, package scripts.
- Produces: `mpv.lock.json` schema v1 with `target`, `version`, `sourceUrl`, `sha256`, `executable`, `licenses`; package artifacts and `.sha256` siblings.

- [x] **Step 1: Write failing manifest verification tests**

```js
// scripts/verify-mpv.test.mjs
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateManifest } from './verify-mpv.mjs'

describe('mpv manifest', () => {
  it('requires four tested targets and immutable sha256 values', () => {
    const manifest = fixtureManifest()
    assert.doesNotThrow(() => validateManifest(manifest))
    delete manifest.builds['x86_64-unknown-linux-gnu']
    assert.throws(() => validateManifest(manifest), /missing target/)
  })

  it('rejects mutable URLs and malformed hashes', () => {
    const manifest = fixtureManifest()
    manifest.builds['x86_64-pc-windows-msvc'].sourceUrl = 'https://example.invalid/latest.zip'
    manifest.builds['x86_64-pc-windows-msvc'].sha256 = 'abc'
    assert.throws(() => validateManifest(manifest))
  })
})
```

Run: `node --test scripts/verify-mpv.test.mjs`

Expected: FAIL because verifier and manifest schema are missing.

- [x] **Step 2: Implement deterministic manifest/fetch verification**

```js
// public validation in scripts/verify-mpv.mjs
const REQUIRED_TARGETS = [
  'x86_64-pc-windows-msvc',
  'x86_64-apple-darwin',
  'aarch64-apple-darwin',
  'x86_64-unknown-linux-gnu',
]

export function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1) throw new Error('unsupported mpv manifest schema')
  for (const target of REQUIRED_TARGETS) {
    const build = manifest.builds[target]
    if (!build) throw new Error(`missing target: ${target}`)
    if (!/^[0-9a-f]{64}$/.test(build.sha256)) throw new Error(`invalid sha256: ${target}`)
    if (!build.version || !build.executable || !build.licenses?.length) {
      throw new Error(`incomplete build metadata: ${target}`)
    }
    const url = new URL(build.sourceUrl)
    if (/\/latest(?:[/.?]|$)/i.test(url.pathname)) throw new Error(`mutable source URL: ${target}`)
  }
}
```

`fetch-mpv.mjs` downloads only the manifest URL for the current Rust target, verifies SHA-256 before extraction, rejects archive path traversal, writes executable under Tauri's target-suffixed sidecar name, and copies listed license files.

- [x] **Step 3: Qualify real mpv candidates on native runners**

For each target, place a candidate archive from a versioned upstream/trusted distribution URL in a clean native runner, then run:

```ts
// schema enforced by scripts/verify-mpv.mjs for tests/fixtures/media/samples.lock.json
interface SampleLock {
  schemaVersion: 1
  samples: readonly [
    SampleRecord & { name: 'h264'; codec: 'h264' },
    SampleRecord & { name: 'h265'; codec: 'hevc' },
    SampleRecord & { name: 'av1'; codec: 'av1' },
  ]
}

interface SampleRecord {
  sourceUrl: string
  sha256: string
  license: string
}
```

Create this lock only from downloaded sample bytes: `verify-mpv.mjs samples record` calculates each hash, rejects mutable `/latest` URLs, validates the interface above, and records the license identifier.

```bash
node scripts/verify-mpv.mjs qualify \
  --target "$RUST_TARGET" \
  --archive "$CANDIDATE_ARCHIVE" \
  --source-url "$VERSIONED_SOURCE_URL" \
  --fixtures "h264,h265,av1"
```

Expected for each target:

```text
PASS executable version captured
PASS JSON IPC startup/load/pause/seek/stop/end
PASS H.264 software decode
PASS H.265 software decode
PASS AV1 software decode
PASS headers absent from process arguments and logs
PASS licenses discovered
PASS sha256 captured
```

The command appends measured metadata to `mpv.lock.json`; it refuses to write an entry if any check fails. Commit only after all four target entries pass. Linux deb additionally verifies `/usr/bin/mpv` against the same minimum measured version; AppImage always uses the bundled verified build.

- [x] **Step 4: Add third-party notices from qualified archives**

```markdown
<!-- docs/release/third-party-sources.md -->
# LumaRoute v0.1 Third-Party Runtime Sources

The machine-readable source URL, exact version, target, and SHA-256 for every
bundled mpv build are recorded in
`apps/desktop/src-tauri/resources/mpv/mpv.lock.json`.

Each package includes the unmodified mpv and FFmpeg license texts under
`resources/third-party/`. The package workflow verifies that every manifest
license entry exists before creating an installer.
```

Copy the exact license texts from the qualified archive/source release; `verify-mpv.mjs` compares their SHA-256 with the recorded license entries.

- [x] **Step 5: Configure exact bundle targets and sidecar resolution**

```json
// relevant apps/desktop/src-tauri/tauri.conf.json bundle section
{
  "bundle": {
    "active": true,
    "targets": "all",
    "externalBin": ["resources/bin/mpv"],
    "resources": [
      "resources/mpv/mpv.lock.json",
      "resources/third-party/*"
    ],
    "windows": {
      "wix": {},
      "nsis": {}
    },
    "macOS": {
      "minimumSystemVersion": "11.0"
    },
    "linux": {
      "appimage": {
        "bundleMediaFramework": true
      },
      "deb": {
        "depends": ["mpv"]
      }
    }
  }
}
```

At startup, `process.rs` resolves only the packaged target-suffixed sidecar or, for deb, `/usr/bin/mpv`; runs `--version`; compares with the qualified minimum; and returns `PlayerUnavailable` if missing/old. No PATH-wide executable search is allowed.

- [x] **Step 6: Create quality CI**

```yaml
# .github/workflows/quality.yml
name: quality
on:
  pull_request:
  push:
    branches: [master, main]
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-13, macos-14, ubuntu-22.04]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10.15.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: dtolnay/rust-toolchain@stable
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm test:rust
      - run: pnpm check:boundaries
```

Install documented Linux Tauri system packages before tests. Pin GitHub Actions to full commit SHAs in the implementation commit after validating those SHAs; the readable tags above describe the selected major releases.

- [x] **Step 7: Create unsigned package CI and checksums**

```yaml
# core matrix in .github/workflows/package.yml
strategy:
  fail-fast: false
  matrix:
    include:
      - os: windows-latest
        target: x86_64-pc-windows-msvc
        args: --bundles msi,nsis
      - os: macos-13
        target: x86_64-apple-darwin
        args: --bundles app,dmg
      - os: macos-14
        target: aarch64-apple-darwin
        args: --bundles app,dmg
      - os: ubuntu-22.04
        target: x86_64-unknown-linux-gnu
        args: --bundles appimage,deb
```

Each job executes:

```bash
pnpm install --frozen-lockfile
node scripts/fetch-mpv.mjs --target "$RUST_TARGET"
node scripts/verify-mpv.mjs installed --target "$RUST_TARGET"
pnpm --filter @lumaroute/desktop tauri build --target "$RUST_TARGET" $BUNDLE_ARGS
node scripts/smoke-packaged.mjs --target "$RUST_TARGET"
node scripts/package-checksums.mjs apps/desktop/src-tauri/target
```

Expected artifacts: Windows `.msi` and `-setup.exe`; each mac architecture `.dmg` (plus Universal DMG when the sidecar qualification confirms a universal merge); Linux `.AppImage` and `.deb`; every artifact has a `.sha256` file and `UNSIGNED-DEVELOPMENT-BUILD.txt`.

- [x] **Step 8: Verify package configuration locally and in CI**

Run:

```bash
node --test scripts/verify-mpv.test.mjs
node scripts/verify-mpv.mjs manifest
pnpm check
gh workflow run package.yml
```

Expected: manifest tests pass; current-target binary compatibility passes; quality matrix is green; package jobs upload all required target artifacts. macOS public distribution remains blocked until Apple signing/notarization credentials exist; Windows public distribution remains blocked until a code-signing certificate exists.

Local note (2026-08-10): manifest tests + `pnpm check` + current-target fetch/installed/smoke are green on Apple Silicon. Full multi-OS package matrix and `gh workflow run` were not executed on this host (no cross-platform runners / workflow dispatch from this session). Action pins still use major tags pending network-validated commit SHAs.

- [ ] **Step 9: Commit packaging and CI**

```bash
git add apps/desktop/src-tauri/resources apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/src/mpv/process.rs docs/release/third-party-sources.md scripts/fetch-mpv.mjs scripts/verify-mpv.mjs scripts/verify-mpv.test.mjs scripts/package-checksums.mjs scripts/smoke-packaged.mjs .github/workflows package.json
git commit -m "build: package verified mpv across desktop targets"
```

## Task 14: 契约、端到端与 v0.1 验收

**可独立验收：** 固定 Emby 响应、临时 Jellyfin、线路故障模拟、UI 主路径、打包启动与真实系统安装清单共同证明设计第 14 节十项验收标准。

**Files:**
- Create: `tests/integration/package.json`
- Create: `tests/integration/vitest.config.ts`
- Create: `tests/integration/support/mock-media-server.ts`
- Create: `tests/integration/line-failover.test.ts`
- Create: `tests/integration/jellyfin-contract.test.ts`
- Create: `playwright.config.ts`
- Create: `tests/e2e/onboarding.spec.ts`
- Create: `tests/e2e/browse-search-play.spec.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `docs/release/v0.1-acceptance.md`
- Modify: `.github/workflows/quality.yml`
- Modify: `.github/workflows/package.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: completed application services, provider fixtures, package artifacts.
- Produces: `test:integration`, `test:e2e`, `acceptance` root scripts and a signed-off per-platform acceptance record.

- [x] **Step 1: Write the failing line-failover integration test**

```ts
// tests/integration/line-failover.test.ts
it('uses backup for timeout and 503, but not for 401 or ServerId mismatch', async () => {
  const primary = await mockServer()
  const backup = await mockServer()
  const app = await createIntegrationApp({
    lines: [primary.line('primary', 0), backup.line('backup', 1)],
  })

  primary.reply('/Users/u/Items', { delayMs: 9_000 })
  backup.reply('/Users/u/Items', { status: 200, fixture: 'jellyfin/items.json' })
  await expect(app.media.getItems('profile-1', firstPage)).resolves.toMatchObject({
    lineId: 'backup',
  })

  app.routes.clearSession('profile-1')
  primary.reply('/Users/u/Items', { status: 503 })
  await expect(app.media.getItems('profile-1', firstPage)).resolves.toMatchObject({
    lineId: 'backup',
  })

  app.routes.clearSession('profile-1')
  primary.reply('/Users/u/Items', { status: 401 })
  await expect(app.media.getItems('profile-1', firstPage)).rejects.toMatchObject({
    code: 'AuthenticationExpired',
  })
  expect(backup.requests('/Users/u/Items')).toHaveLength(2)

  backup.reply('/System/Info', { status: 200, body: { Id: 'different-server' } })
  await expect(app.lines.addLine('profile-1', backup.line('mismatch', 2)))
    .rejects.toMatchObject({ code: 'ServerMismatch' })
})
```

Run: `pnpm --filter @lumaroute/integration test -- line-failover`

Expected: FAIL until the mock server/composition harness is wired to real core services.

- [x] **Step 2: Implement deterministic local failure scenarios**

```ts
// tests/integration/support/mock-media-server.ts
export async function mockServer(): Promise<MockMediaServer> {
  const routes = new Map<string, Reply>()
  const requests: RecordedRequest[] = []
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost')
    requests.push({ method: request.method!, path: url.pathname, headers: request.headers })
    const reply = routes.get(url.pathname) ?? { status: 404 }
    if (reply.delayMs) await setTimeout(reply.delayMs)
    response.statusCode = reply.status ?? 200
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(reply.body ?? loadFixture(reply.fixture)))
  })
  await listenOnRandomLoopbackPort(server)
  return createMockMediaServerApi(server, routes, requests)
}
```

The harness binds only to `127.0.0.1`, records requests after header redaction, and closes in `afterEach`.

Run: `pnpm --filter @lumaroute/integration add -D vitest testcontainers`

Expected: integration dependencies are written only to `tests/integration/package.json` and locked.

- [x] **Step 3: Write failing live Jellyfin contract test**

```ts
// tests/integration/jellyfin-contract.test.ts
it('authenticates, browses, searches, and reports progress to temporary Jellyfin', async () => {
  const jellyfin = await startJellyfinContainer()
  await jellyfin.completeStartupWizard({
    username: 'lumaroute-test',
    password: randomPassword(),
    mediaFixture: controlledPublicSample(),
  })
  const session = await adapter.authenticate(jellyfin.loginInput())
  const context = jellyfin.context(session)
  expect(await adapter.getLibraries(context)).toHaveLength(1)
  expect((await adapter.getItems(firstPage, context)).items).not.toHaveLength(0)
  expect((await adapter.search(searchQuery, context)).items).not.toHaveLength(0)
  await expect(adapter.reportPlayback(startedReport, context)).resolves.toBeUndefined()
  await expect(adapter.reportPlayback(stoppedReport, context)).resolves.toBeUndefined()
})
```

Run: `pnpm --filter @lumaroute/integration test -- jellyfin-contract`

Expected: FAIL before container bootstrap and controlled media fixture are implemented.

- [x] **Step 4: Implement temporary Jellyfin bootstrap**

```ts
// essential container contract
export async function startJellyfinContainer(): Promise<JellyfinHarness> {
  const container = await new GenericContainer('jellyfin/jellyfin')
    .withExposedPorts(8096)
    .withCopyDirectoriesToContainer([{
      source: controlledFixtureDirectory(),
      target: '/media',
    }])
    .withWaitStrategy(Wait.forHttp('/System/Info/Public', 8096).forStatusCode(200))
    .start()
  return new JellyfinHarness(container)
}
```

Resolve `jellyfin/jellyfin` to an immutable image digest in the implementation commit. Generate username/password at runtime; redact them from container output and CI logs; always stop the container in `afterAll`.

- [x] **Step 5: Write failing UI journey tests**

```ts
// tests/e2e/fixtures.ts
export const test = base.extend<{
  mediaServers: MediaServerFixtures
  fakeMpv: FakeMpvController
}>({
  mediaServers: async ({}, use) => {
    const fixtures = await startTwoMockMediaServers()
    await use(fixtures)
    await fixtures.close()
  },
  fakeMpv: async ({}, use) => {
    const controller = await startFakeMpvController()
    await use(controller)
    await controller.close()
  },
})

export { expect } from '@playwright/test'
```

```ts
// tests/e2e/onboarding.spec.ts
test('adds two logical servers with two validated lines each', async ({ page }) => {
  await page.goto('/')
  await addServer(page, serverOne)
  await addValidatedLine(page, serverOne.backup)
  await addServer(page, serverTwo)
  await addValidatedLine(page, serverTwo.backup)
  await expect(page.getByTestId('server-switcher')).toContainText(['Server One', 'Server Two'])
  await expect(page.getByTestId('line-list')).toHaveCount(2)
})
```

```ts
// tests/e2e/browse-search-play.spec.ts
test('browses, searches, starts playback, and shows progress', async ({ page }) => {
  await seedAuthenticatedProfiles(page)
  await page.getByTestId('library-movies').click()
  await expect(page.getByTestId('media-card').first()).toBeVisible()
  await page.getByRole('searchbox').fill('Arrival')
  await page.getByText('Arrival').click()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('player-state')).toHaveText('Playing')
  await fakeMpv.advanceTo(12)
  await expect(mockServer.lastProgress()).resolves.toMatchObject({
    PositionTicks: 120_000_000,
  })
})
```

Run: `pnpm exec playwright test`

Expected: FAIL because the browser test composition and deterministic native/player fakes are not configured.

- [x] **Step 6: Implement deterministic E2E composition**

```ts
// playwright.config.ts
export default defineConfig({
  testDir: 'tests/e2e',
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @lumaroute/desktop preview --host 127.0.0.1',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
})
```

Build the test composition with the real Vue stores/core services, in-memory SQLite/keyring adapters, local mock HTTP servers, and `FakePlayerEngine`. Production builds cannot select these fakes because the switch is compile-time test configuration, not a runtime query parameter.

Run:

```bash
pnpm add -Dw @playwright/test
pnpm exec playwright install
```

Expected: Playwright is locked and current-platform browser binaries install successfully.

- [x] **Step 7: Create the explicit v0.1 acceptance record**

```markdown
<!-- docs/release/v0.1-acceptance.md -->
# LumaRoute v0.1 Acceptance

## Automated evidence

- [ ] Two logical servers, each with two ServerId-validated lines.
- [ ] Timeout and 503 browsing fail over; 401 does not.
- [ ] Playback startup failure regenerates and loads a backup-line plan.
- [ ] Movie, series, season, and episode browsing.
- [ ] Current-server search.
- [ ] mpv direct play and remux-only direct stream; transcode-only rejection.
- [ ] Progress normally remains within 10 seconds.
- [ ] Windows x64 MSI/NSIS, macOS Intel/Apple Silicon DMG, Linux x64 AppImage/deb.
- [ ] Credential leakage scans return zero findings.

## Real-system release checks

- [ ] Windows x64 clean install, launch, uninstall, and same-version repair.
- [ ] macOS Intel clean install, launch, and uninstall.
- [ ] macOS Apple Silicon clean install, launch, and uninstall.
- [ ] Linux x64 AppImage launch and removal.
- [ ] Linux x64 deb install, launch, upgrade simulation, and uninstall.
- [ ] Every artifact SHA-256 matches its sibling file.
- [ ] Public macOS build is signed/notarized and public Windows build is signed.
- [ ] Project license is selected before any public release is described as open source.
```

Each checkbox receives a CI run URL or tester/date/OS evidence in the release PR; failed evidence blocks release.

- [x] **Step 8: Add the final quality/acceptance commands**

```json
// root package.json script additions
{
  "scripts": {
    "test:integration": "pnpm --filter @lumaroute/integration test",
    "test:e2e": "playwright test",
    "acceptance": "pnpm check && pnpm test:integration && pnpm test:e2e"
  }
}
```

Run:

```bash
pnpm acceptance
pnpm --filter @lumaroute/desktop tauri build
node scripts/smoke-packaged.mjs --current-platform
git diff --check
```

Expected: all unit/contract/integration/E2E tests pass; current-platform packages launch; leakage scanner has zero findings; `git diff --check` has no output.

- [ ] **Step 9: Run and record all three platform package jobs**

Run: `gh workflow run package.yml`

Expected: Windows, two macOS architecture jobs, and Linux jobs are green; artifacts and SHA-256 files are attached; `docs/release/v0.1-acceptance.md` links the run as automated evidence.

- [ ] **Step 10: Commit v0.1 acceptance coverage**

```bash
git add tests/integration tests/e2e playwright.config.ts docs/release/v0.1-acceptance.md .github/workflows package.json pnpm-lock.yaml
git commit -m "test: verify the LumaRoute v0.1 journey"
```

## Plan Author Self-Review Record

- [x] Spec §§1–4 product goal, included/excluded scope: Global Constraints and Tasks 3–14.
- [x] Spec §5 architecture/ports: Canonical Interfaces, Tasks 1–3, boundary scan in Task 12.
- [x] Spec §6 logical server vs line, identity check, ordering, stickiness, manual override, error classes, sequential retry: Tasks 2, 4, 5, 14.
- [x] Spec §7 Emby/Jellyfin interface, Tauri HTTP, redirects, TLS stance, device ID, password disposal, keyring: Tasks 3, 6, 7, 9, 10, 12.
- [x] Spec §8 direct play/remux, independent mpv, random/private IPC, no command-line Token, controls/events, cleanup, progress cadence/retry: Tasks 8–10.
- [x] Spec §9 onboarding, shell, browse/search/detail/settings: Tasks 3–7 and 9.
- [x] Spec §10 SQLite migrations, ephemeral UI/cache state, server-isolated cache/cancellation: Tasks 2, 5, 11.
- [x] Spec §11 error codes, actionable UI, centralized redaction: Canonical Interfaces and Task 12.
- [x] Spec §12 target artifacts, mpv qualification, third-party notices, signatures, SHA-256: Task 13 and acceptance release gates.
- [x] Spec §13 unit/fixture/live Jellyfin/mock failure/mpv/UI/package tests: Tasks 1–14, especially Tasks 4, 8, 12–14.
- [x] Spec §14 ten acceptance outcomes: Task 14 maps each outcome to automated or real-system evidence.
- [x] Type consistency: `ServerProfile`, `ServerLine`, ports, `MediaServerAdapter`, `PlaybackPlan`, `PlayerEngine`, `PlaybackReport`, and `AppErrorCode` retain the canonical names/signatures through their consuming tasks.
- [x] Task ordering: every consumed interface is introduced in an earlier task or in Canonical Interfaces; security and performance gates run before packaging; full acceptance runs last.
- [x] File responsibility: core domain, provider DTOs, platform adapters, Vue views, Rust process/IPC, scripts, workflows, and release evidence remain in focused files rather than a monolithic module.
- [x] Exact file inventory: every task path appears in the front-of-plan inventory, and every inventoried path is owned by at least one task.
- [x] Placeholder scan: zero matches for incomplete markers or empty implementation instructions.

## 后续演进

- 开发态 macOS 钥匙串反复授权弹窗：暂缓，见 `docs/known-issues.md`。
