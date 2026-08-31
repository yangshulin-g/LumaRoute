# LumaRoute v0.1 Internal Alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不新增产品能力、不合入 v0.2 播放器扩展的前提下，为现有 LumaRoute v0.1 建立可复现的播放启动换线、真实 mpv、三平台安装包和 macOS/Windows Emby 实机闭环证据，交付仅供内部技术验证的未签名 Alpha；Jellyfin live 验证延期。

**Architecture:** 保持现有分层与稳定契约：`packages/core` 只修复既有播放启动错误分类并承载线路重试，`apps/desktop/src-tauri` 继续只负责独立 mpv 进程、受限 JSON IPC 与稳定原生错误，集成测试和 GitHub Actions 负责生成自动化证据。`docs/release/v0.1-acceptance.md` 是唯一验收记录；自动化、CI 产物、实机结果与明确环境限制都只汇总到该文件。

**Tech Stack:** pnpm 10.15.0、Node.js 22、TypeScript 5.9、Vitest 4、Testcontainers 11、Rust stable、Tokio、Tauri 2、独立 mpv 0.41 系列 JSON IPC、Playwright、GitHub Actions、Windows x64、macOS Apple Silicon；Linux x64 与 macOS Intel CI 延期。

## Global Constraints

- 本计划只做 Internal Alpha 收口；不新增产品能力。
- 不增加音轨、字幕、章节、音量或全屏控制。
- 不改变独立 mpv 进程和 JSON IPC 架构。
- 不实现播放中断后的自动换线；只允许 mpv 确认开始播放前的换线重试。
- 不增加转码、聚合搜索、跨源匹配或更多媒体来源。
- 不要求 macOS 公证、Windows 签名、自动更新或公开 GitHub Release。
- 不借入 Nowen Video 的服务端、刮削、Go sidecar 或 libmpv Render Surface。
- v0.1 收口基于当前 v0.1 基线，只接受验收、测试、打包和保持现有契约的缺陷修复。
- v0.2 Player Basics 必须保留在独立分支或 PR；v0.2 只能在 Internal Alpha 通过后合并，并重新运行完整 Alpha 回归。
- `packages/core` 不导入 Vue、Pinia、Tauri API 或具体数据库实现；`packages/player` 不新增 v0.2 控制或类型。
- Rust 层保持最薄；业务线路策略、服务端 DTO 映射和进度策略仍在 TypeScript core。
- 页面不直接解析服务端 DTO，也不直接访问 SQLite、凭证或 mpv IPC。
- Token、密码、私有服务器地址和敏感请求头不得进入 SQLite、URL、命令行、普通配置、测试夹具、验收文档或日志。
- HTTP 只访问用户明确配置的线路，拒绝意外跨域重定向，不增加忽略 TLS 错误的开关。
- 每次播放会话继续使用随机 IPC 地址和当前用户权限；敏感请求头只通过 IPC 注入。
- 只修复阻止既有 v0.1 契约通过验收的缺陷；若需要改变范围或架构，停止实现并先修订 spec。
- mpv/IPC 失败继续使用既有 `PlayerUnavailable` / `PlaybackFailed` 稳定错误。
- 所有行为修复都遵循失败测试 → 最小实现 → 绿灯测试；不能用人工点击代替自动化证据。
- Internal Alpha 产物必须明确标注“未签名或未公证”“仅供内部技术验证”“可能触发操作系统安全警告”“不面向普通用户公开分发”。
- Linux quality/package 延期，不作为本阶段硬门；macOS Apple Silicon 与 Windows 必须补充实机安装和播放证据。
- `docs/release/v0.1-acceptance.md` 是唯一验收记录；不要创建第二份结果表或把私人测试数据写入仓库。
- 只有全量质量门、专用播放换线、Windows/Apple Silicon 产物与 SHA-256、macOS/Windows Emby 实机闭环、真实 mpv 样片和零凭证泄漏全部满足后，才能标记 Internal Alpha 通过。
- Jellyfin 适配器与固定响应测试继续保留；live 容器和实机闭环延期，不得单独阻塞质量矩阵或本次 Internal Alpha。
- `macos-13` / `x86_64-apple-darwin` 因 runner 环境不可用而延期；Ubuntu / `x86_64-unknown-linux-gnu` 因 package qualify 挂起而延期。质量与打包硬门只包含 Windows x64 与 macOS Apple Silicon；ARM 结果不得替代 Intel 证据，也不得把 Linux 未完成 job 记为通过。
- 每个任务结束前运行该任务的精确测试与 `git diff --check`；每任务的 commit 命令只在执行本计划时使用，本计划编写阶段不提交。

---

## 当前仓库事实与已知阻塞

- 基线提交：`be3e2ac7d3b7fcfc5b034ce4265eeede5086d6eb`，分支 `main`，远端 `git@github.com:yangshulin-g/LumaRoute.git`。
- `packages/core/src/playback/playback-service.test.ts` 已有“首选线路加载失败后重建备用线路计划”的单元测试，但使用的是构造出的 `AppError('PlaybackFailed', 'network load failed')`；没有专用集成测试证明原生 Tauri 拒绝对象、备用计划、媒体源、播放会话和进度上下文完整切换。
- `NativeError` 当前只有 `InvalidInput`、`StorageFailure`、`PlayerUnavailable`；`MpvSession::wait_for_file_loaded` 把加载阶段错误统一返回 `PlayerUnavailable`。与此同时 `isPreStartNetworkFailure` 明确不重试 `PlayerUnavailable`，因此现有单元测试不能证明真实原生错误路径会换线。
- 本机定向 TypeScript 播放测试为 2 个文件、6 个测试通过；`mpv.lock.json` 结构校验通过。这只证明单元与清单，不证明真实 mpv 解码或安装包运行。
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test mpv_session -- --nocapture` 当前 3 个测试通过；因 `resources/bin` 只有 `.gitkeep`，`real_packaged_mpv_creates_ipc_socket_when_available` 走的是提前返回，不能计作真实 mpv 证据。
- 本机 Docker/OrbStack socket 不存在；live Jellyfin contract 可记录为环境跳过，且自 2026-08-21 的 Emby-first 决策起不再是本次 Alpha 硬门。
- Jellyfin 当前使用可变标签 `jellyfin/jellyfin:10.10.7`。Docker Hub 2026-08-21 返回的多架构 manifest digest 为 `sha256:7ae36aab93ef9b6aaff02b37f8bb23df84bb2d7a3f6054ec8fc466072a648ce2`；实施时仍须用 registry inspect 再核对该 tag 未漂移后才提交。
- quality workflow 当前唯一运行是失败的 [run 32022148857](https://github.com/yangshulin-g/LumaRoute/actions/runs/32022148857)：四个平台的 `pnpm test:rust` 都在 Tauri build script 阶段因缺少目标后缀 mpv sidecar 失败。
- package workflow 已启用但没有历史运行；不得把 workflow 文件存在视为产物已生成。
- `package.yml` 当前只执行 installed/version 与 sidecar `--version` 冒烟，没有在每个原生 runner 上执行 H.264/H.265/AV1 解码与完整 JSON IPC 冒烟。
- Windows x64 与 Apple Silicon 的 `mpv.lock.json` 状态仅能由对应原生 package 日志改为 `qualified`。Linux 与 macOS Intel 保持 `archive-sealed` 且延期，不能用 ARM 结果或未完成 Ubuntu job 直接改为通过。
- `tauri.conf.json` 引用了 `icons/32x32.png`、`icons/128x128.png`、`icons/henry.w@example.net`、`icons/icon.icns`、`icons/icon.ico`，而当前 icons 目录只发现两个 Android XML；打包 job 必须实际运行以确认或暴露该缺口，不在计划阶段假定可打包。

## 精确文件清单

### 播放启动换线

- Modify: `packages/core/src/playback/playback-service.ts`
- Modify: `packages/core/src/playback/playback-service.test.ts`
- Modify: `apps/desktop/src-tauri/src/error.rs`
- Modify: `apps/desktop/src-tauri/src/mpv/session.rs`
- Modify: `apps/desktop/src-tauri/tests/mpv_session.rs`
- Modify: `tests/integration/support/create-integration-app.ts`
- Create: `tests/integration/playback-startup-failover.test.ts`

### Jellyfin 延期契约

- Modify: `tests/integration/support/jellyfin-container.ts`
- Modify: `tests/integration/jellyfin-contract.test.ts`
- Modify: `.github/workflows/quality.yml`

### 真实 mpv 与打包

- Modify: `scripts/verify-mpv.mjs`
- Modify: `scripts/verify-mpv.test.mjs`
- Modify: `scripts/smoke-packaged.mjs`
- Create: `scripts/smoke-packaged.test.mjs`
- Modify: `scripts/package-checksums.mjs`
- Create: `scripts/package-checksums.test.mjs`
- Modify: `.github/workflows/quality.yml`
- Modify: `.github/workflows/package.yml`
- Modify: `package.json`
- Modify only if an actual native qualification result changes measured metadata: `apps/desktop/src-tauri/resources/mpv/mpv.lock.json`
- Modify only if package build proves current icon references invalid: `apps/desktop/src-tauri/tauri.conf.json`
- Create only if package build proves current icon references invalid: `apps/desktop/src-tauri/icons/32x32.png`
- Create only if package build proves current icon references invalid: `apps/desktop/src-tauri/icons/128x128.png`
- Create only if package build proves current icon references invalid: `apps/desktop/src-tauri/icons/icon.png`
- Create only if package build proves current icon references invalid: `apps/desktop/src-tauri/icons/icon.icns`
- Create only if package build proves current icon references invalid: `apps/desktop/src-tauri/icons/icon.ico`

### 验收记录

- Modify: `docs/release/v0.1-acceptance.md`

## Canonical Interfaces

以下接口在整个计划中保持一致；任务实现者不得引入 v0.2 播放控制或替代架构。

```ts
// packages/core/src/playback/playback-service.ts
export function isPreStartNetworkFailure(error: unknown): boolean

export class PlaybackService {
  constructor(
    storage: StoragePort,
    credentials: CredentialStore,
    routes: RouteExecutor,
    adapterFor: (kind: ServerKind) => MediaPlaybackAdapter,
    player: PlayerEngine,
  )

  play(
    profileId: string,
    itemId: string,
    startPositionSeconds?: number,
  ): Promise<{ plan: PlaybackPlan; lineId: string }>
}
```

```ts
// packages/player/src/types.ts — 本计划不修改
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
  method: 'direct-play' | 'direct-stream'
  startPositionSeconds: number
}

export interface PlayerEngine {
  play(plan: PlaybackPlan): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  seek(positionSeconds: number): Promise<void>
  stop(): Promise<void>
  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe
}
```

```rust
// apps/desktop/src-tauri/src/error.rs
pub enum NativeError {
    InvalidInput(String),
    StorageFailure(String),
    PlayerUnavailable(String),
    PlaybackFailed(String),
}

impl NativeError {
    pub fn playback_failed(message: impl Into<String>) -> Self;
    pub fn code(&self) -> &'static str;
    pub fn message(&self) -> &str;
}
```

```ts
// tests/integration/support/create-integration-app.ts
export type IntegrationApp = {
  media: MediaService
  playback: PlaybackService
  player: RecordingPlayerEngine
  lines: LineService
  routes: RouteExecutor
  storage: MemoryStorage
  credentials: MemoryCredentialStore
}

export class RecordingPlayerEngine implements PlayerEngine {
  readonly plans: PlaybackPlan[]
  failNext(error: unknown): void
  play(plan: PlaybackPlan): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  seek(positionSeconds: number): Promise<void>
  stop(): Promise<void>
  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe
}
```

```ts
// tests/integration/support/jellyfin-container.ts
export const JELLYFIN_IMAGE =
  'jellyfin/jellyfin@sha256:7ae36aab93ef9b6aaff02b37f8bb23df84bb2d7a3f6054ec8fc466072a648ce2'

export function requireContainerRuntime(available: boolean): boolean
export async function isContainerRuntimeAvailable(): Promise<boolean>
export async function startJellyfinContainer(): Promise<JellyfinHarness>
```

```js
// scripts/verify-mpv.mjs
export async function verifyInstalled(
  target = currentRustTarget(),
  options = { fixtures: 'h264,h265,av1', requireIpc: true },
)
// prints version, all selected software-decode results, JSON IPC/control/event result,
// header leakage result, license result, and target qualification result.
```

自动化和实机证据在 `docs/release/v0.1-acceptance.md` 中统一使用以下字段，不创建新的 JSON/YAML 证据格式：

```markdown
- [ ] Temporary Jellyfin contract is deferred.
  - Evidence: not required for this Emby-first Internal Alpha
  - Limitations: live container and real-system validation deferred; adapter and fixture tests remain
```

未通过项必须保持 `- [ ]`，并写实际原因；不得把“workflow 已定义”“测试被跳过”或“测试函数提前返回”记为通过。

## Task 1: 用真实错误形状锁定播放启动换线

**可独立验收：** 首选线路可生成初始计划；mpv 加载前收到结构化 `PlaybackFailed` 网络错误后，`PlaybackService` 串行切到备用线路并重新生成、加载计划；返回值和后续报告使用备用计划的 `lineId`、`mediaSourceId` 与 `playSessionId`。`401/403`、资源 `4xx`、`MediaNotDirectPlayable` 和真正的 `PlayerUnavailable` 不换线。

**Files:**
- Modify: `packages/core/src/playback/playback-service.test.ts`
- Modify: `packages/core/src/playback/playback-service.ts`
- Modify: `apps/desktop/src-tauri/src/error.rs`
- Modify: `apps/desktop/src-tauri/src/mpv/session.rs`
- Modify: `apps/desktop/src-tauri/tests/mpv_session.rs`
- Modify: `tests/integration/support/create-integration-app.ts`
- Create: `tests/integration/playback-startup-failover.test.ts`

**Interfaces:**
- Consumes: canonical `PlaybackPlan`, `PlayerEngine`, `RouteExecutor.execute`, `MediaPlaybackAdapter.getPlaybackPlan`, `AppErrorCode`.
- Produces: structural native error recognition in `isPreStartNetworkFailure`; `NativeError::PlaybackFailed`; `IntegrationApp.playback`; `RecordingPlayerEngine`.

- [ ] **Step 1: 写原生加载错误分类的失败测试**

```rust
// apps/desktop/src-tauri/src/error.rs
#[test]
fn serializes_playback_failed_with_stable_code() {
    let error = NativeError::playback_failed("network timeout while loading");
    let value = serde_json::to_value(&error).unwrap();
    assert_eq!(value["code"], "PlaybackFailed");
    assert_eq!(value["message"], "network timeout while loading");
}
```

```rust
// apps/desktop/src-tauri/tests/mpv_session.rs
#[tokio::test]
async fn classifies_pre_start_load_rejection_as_playback_failed() {
    let mut harness = TestHarness::start_rejecting_load("network timeout").await;
    let error = harness.play(test_plan()).await.unwrap_err();
    assert_eq!(error.code(), "PlaybackFailed");
    assert!(error.message().contains("network timeout"));
}
```

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  serializes_playback_failed_with_stable_code
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --test mpv_session classifies_pre_start_load_rejection_as_playback_failed -- --nocapture
```

Expected: FAIL because `NativeError::PlaybackFailed`, `playback_failed`, and the rejecting fake-mpv mode do not exist.

- [ ] **Step 2: 最小化区分播放器不可用与媒体加载失败**

```rust
// apps/desktop/src-tauri/src/error.rs
#[derive(Debug, Error)]
pub enum NativeError {
    #[error("{0}")]
    InvalidInput(String),
    #[error("{0}")]
    StorageFailure(String),
    #[error("{0}")]
    PlayerUnavailable(String),
    #[error("{0}")]
    PlaybackFailed(String),
}

pub fn playback_failed(message: impl Into<String>) -> Self {
    Self::PlaybackFailed(sanitize_message(message.into()))
}

pub fn code(&self) -> &'static str {
    match self {
        Self::InvalidInput(_) => "InvalidInput",
        Self::StorageFailure(_) => "StorageFailure",
        Self::PlayerUnavailable(_) => "PlayerUnavailable",
        Self::PlaybackFailed(_) => "PlaybackFailed",
    }
}
```

在 `MpvSession::start_with_executable`、IPC 建立、sidecar 缺失/版本错误处继续返回 `PlayerUnavailable`；只把 `loadfile` 发出后、`Started/file-loaded` 之前的 mpv 拒绝、网络超时、连接失败映射为 `PlaybackFailed`。错误消息继续经过 `sanitize_message`，不得包含 URL、请求头或文件路径。

Run: 重复 Step 1 两条命令。

Expected: PASS；`PlaybackFailed` 序列化只有稳定 `code` 与脱敏 `message`。

- [ ] **Step 3: 写结构化 Tauri 拒绝对象和非重试分类的失败测试**

```ts
// packages/core/src/playback/playback-service.test.ts
it.each([
  [{ code: 'PlaybackFailed', message: 'connection timed out before file-loaded' }, true],
  [{ code: 'PlaybackFailed', message: 'HTTP 503 while loading' }, true],
  [{ code: 'PlaybackFailed', message: 'HTTP 401 while loading' }, false],
  [{ code: 'PlaybackFailed', message: 'HTTP 403 while loading' }, false],
  [{ code: 'PlaybackFailed', message: 'HTTP 404 while loading' }, false],
  [{ code: 'PlaybackFailed', message: 'unsupported codec' }, false],
  [{ code: 'PlayerUnavailable', message: 'packaged mpv sidecar missing' }, false],
  [{ code: 'MediaNotDirectPlayable', message: 'transcode required' }, false],
])('classifies pre-start native rejection %j as %s', (error, retryable) => {
  expect(isPreStartNetworkFailure(error)).toBe(retryable)
})
```

Run: `pnpm vitest run packages/core/src/playback/playback-service.test.ts`

Expected: FAIL for plain `{ code, message }` Tauri rejection objects because current code only recognizes `instanceof AppError`.

- [ ] **Step 4: 最小化实现稳定错误对象识别**

```ts
// packages/core/src/playback/playback-service.ts
type StableError = { code?: unknown; message?: unknown; status?: unknown; cause?: unknown }

function stableError(error: unknown): StableError | null {
  return typeof error === 'object' && error !== null ? error as StableError : null
}

export function isPreStartNetworkFailure(error: unknown): boolean {
  const current = stableError(error)
  const code = error instanceof AppError ? error.code : current?.code
  const message = String(error instanceof Error ? error.message : current?.message ?? '').toLowerCase()
  const status = httpStatus(error)

  if (code === 'NetworkUnavailable' || code === 'LineTimeout') return true
  if (
    code === 'PlayerUnavailable'
    || code === 'AuthenticationExpired'
    || code === 'MediaNotDirectPlayable'
  ) return false
  if (status === 401 || status === 403 || (status !== undefined && status >= 400 && status < 500)) {
    return false
  }
  if (code === 'PlaybackFailed') {
    if (/(401|403|4\d\d|codec|unsupported|format|decode|transcod)/.test(message)) return false
    return /(timeout|timed out|connection|dns|network|502|503|504)/.test(message)
  }
  return status === 502 || status === 503 || status === 504
}
```

Run: `pnpm vitest run packages/core/src/playback/playback-service.test.ts`

Expected: PASS；结构化原生错误和 `AppError` 使用相同重试规则。

- [ ] **Step 5: 写专用播放启动换线集成失败测试**

```ts
// tests/integration/playback-startup-failover.test.ts
it('regenerates, loads, and reports with the backup-line plan', async () => {
  const primary = await mockServer()
  const backup = await mockServer()
  servers.push(primary, backup)

  primary.reply('/Items/item-1/PlaybackInfo', {
    body: playbackInfo('source-primary', 'session-primary'),
  })
  backup.reply('/Items/item-1/PlaybackInfo', {
    body: playbackInfo('source-backup', 'session-backup'),
  })
  const app = await createIntegrationApp({
    lines: [primary.line('primary', 0), backup.line('backup', 1)],
  })
  app.player.failNext({
    code: 'PlaybackFailed',
    message: 'network timeout before file-loaded',
  })

  const result = await app.playback.play('profile-1', 'item-1', 12)

  expect(app.player.plans.map((plan) => new URL(plan.streamUrl).origin)).toEqual([
    primary.baseUrl,
    backup.baseUrl,
  ])
  expect(result).toMatchObject({
    lineId: 'backup',
    plan: {
      mediaSourceId: 'source-backup',
      playSessionId: 'session-backup',
      startPositionSeconds: 12,
    },
  })

  const reporter = new ProgressReporter(new ImmediateClock(), silentLogger)
  reporter.start(result.plan, (report) => app.media.reportPlayback('profile-1', report))
  await reporter.handle({ type: 'started', positionSeconds: 12, durationSeconds: 120 })
  await reporter.whenIdle()
  await expect(backup.lastProgress()).resolves.toMatchObject({
    MediaSourceId: 'source-backup',
    PlaySessionId: 'session-backup',
    PositionTicks: 120_000_000,
  })
})

it.each([
  { code: 'AuthenticationExpired', message: 'HTTP 401' },
  { code: 'PlaybackFailed', message: 'HTTP 403 while loading' },
  { code: 'PlaybackFailed', message: 'HTTP 404 while loading' },
  { code: 'MediaNotDirectPlayable', message: 'transcode required' },
  { code: 'PlayerUnavailable', message: 'mpv missing' },
])('does not fail over for $code: $message', async (error) => {
  const app = await failoverHarness()
  app.player.failNext(error)
  await expect(app.playback.play('profile-1', 'item-1')).rejects.toMatchObject(error)
  expect(app.player.plans).toHaveLength(1)
  expect(app.backup.requests('/Items/item-1/PlaybackInfo')).toHaveLength(0)
})
```

Run: `pnpm --filter @lumaroute/integration test -- playback-startup-failover`

Expected: FAIL because `IntegrationApp` does not expose `PlaybackService` or a recording/failing `PlayerEngine`, and the dedicated test file does not exist.

- [ ] **Step 6: 扩展集成组合根并让专用场景通过**

```ts
// tests/integration/support/create-integration-app.ts
export class RecordingPlayerEngine implements PlayerEngine {
  readonly plans: PlaybackPlan[] = []
  private nextError: unknown

  failNext(error: unknown): void {
    this.nextError = error
  }

  async play(plan: PlaybackPlan): Promise<void> {
    this.plans.push(structuredClone(plan))
    if (this.nextError !== undefined) {
      const error = this.nextError
      this.nextError = undefined
      throw error
    }
  }

  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async seek(_positionSeconds: number): Promise<void> {}
  async stop(): Promise<void> {}
  subscribe(_listener: (event: PlayerEvent) => void): Unsubscribe {
    return () => undefined
  }
}

// inside createIntegrationApp
const player = new RecordingPlayerEngine()
const playback = new PlaybackService(storage, credentials, routes, () => adapter, player)
return { media, playback, player, lines, routes, storage, credentials }
```

Run:

```bash
pnpm --filter @lumaroute/integration test -- playback-startup-failover
pnpm vitest run packages/core/src/playback/playback-service.test.ts
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test mpv_session -- --nocapture
git diff --check
```

Expected: 专用场景 PASS；Rust mpv session 现有 3 个测试和新增错误测试 PASS；`git diff --check` 无输出。

- [ ] **Step 7: Commit 播放启动换线证据**

```bash
git add packages/core/src/playback/playback-service.ts \
  packages/core/src/playback/playback-service.test.ts \
  apps/desktop/src-tauri/src/error.rs \
  apps/desktop/src-tauri/src/mpv/session.rs \
  apps/desktop/src-tauri/tests/mpv_session.rs \
  tests/integration/support/create-integration-app.ts \
  tests/integration/playback-startup-failover.test.ts
git commit -m "fix: prove playback startup failover end to end"
```

## Task 2: 保留 Jellyfin 容器契约并延期 live 门禁

**可独立验收：** Jellyfin 适配器、固定响应测试、不可变容器 digest 和现有 live 契约继续保留；质量矩阵只运行确定性的非 live 集成场景，不因 live Jellyfin 跳过、扫描不到媒体或失败而失败。不得继续改写媒体路径、样片、挂载、`collectionType` 或 ParentId 等待来追逐容器绿灯。

**Files:**
- Modify: `tests/integration/support/jellyfin-container.ts`
- Modify: `tests/integration/jellyfin-contract.test.ts`
- Modify: `.github/workflows/quality.yml`

**Interfaces:**
- Consumes: `GenericContainer`, `JellyfinAdapter`,受控 `/media` 夹具、`LUMAROUTE_REQUIRE_CONTAINER`.
- Produces: exact `JELLYFIN_IMAGE`; optional live contract including `getPlaybackPlan`; deterministic quality integration selection that excludes the deferred live contract.

- [ ] **Step 1: 保留 digest 和显式 live 运行时测试**

```ts
// tests/integration/jellyfin-contract.test.ts
it('pins Jellyfin to the reviewed immutable manifest digest', () => {
  expect(JELLYFIN_IMAGE).toBe(
    'jellyfin/jellyfin@sha256:7ae36aab93ef9b6aaff02b37f8bb23df84bb2d7a3f6054ec8fc466072a648ce2',
  )
})

it('fails closed when CI requires a container runtime', () => {
  if (dockerAvailable) return
  vi.stubEnv('LUMAROUTE_REQUIRE_CONTAINER', '1')
  expect(() => requireContainerRuntime(false)).toThrow(/container runtime is required/i)
  vi.unstubAllEnvs()
})
```

Run: `pnpm --filter @lumaroute/integration test -- jellyfin-contract`

Expected: FAIL because `JELLYFIN_IMAGE` and `requireContainerRuntime` do not exist and the current image is tag-based.

- [ ] **Step 2: 固定镜像并把 CI 跳过转换成失败**

实施前先从可访问 Docker registry 的环境核对：

```bash
docker buildx imagetools inspect jellyfin/jellyfin:10.10.7
```

Expected: manifest list digest exactly equals `sha256:7ae36aab93ef9b6aaff02b37f8bb23df84bb2d7a3f6054ec8fc466072a648ce2`。若不相等，停止任务并审查上游镜像变化；不要静默替换本计划中的 digest。

```ts
// tests/integration/support/jellyfin-container.ts
export const JELLYFIN_IMAGE =
  'jellyfin/jellyfin@sha256:7ae36aab93ef9b6aaff02b37f8bb23df84bb2d7a3f6054ec8fc466072a648ce2'

export function requireContainerRuntime(available: boolean): boolean {
  if (!available && process.env.LUMAROUTE_REQUIRE_CONTAINER === '1') {
    throw new Error('Jellyfin container runtime is required but unavailable')
  }
  return available
}

export async function resolveJellyfinImage(): Promise<string> {
  const override = process.env.LUMAROUTE_JELLYFIN_IMAGE
  if (override && !/@sha256:[0-9a-f]{64}$/.test(override)) {
    throw new Error('LUMAROUTE_JELLYFIN_IMAGE must use an immutable sha256 digest')
  }
  return override ?? JELLYFIN_IMAGE
}
```

不要把固定用户名、密码或 token 输出到测试日志；运行时密码继续由 `randomPassword()` 生成，`afterAll` 必须停止容器。

- [ ] **Step 3: 补齐播放计划和进度断言**

```ts
// tests/integration/jellyfin-contract.test.ts
it('authenticates, browses, searches, plans playback, and reports progress', async () => {
  const session = await adapter.authenticate(jellyfin.loginInput())
  const context = jellyfin.context(session)
  expect(await adapter.getLibraries(context)).toHaveLength(1)
  const items = await adapter.getItems(firstPage, context)
  expect(items.items).not.toHaveLength(0)
  const itemId = items.items[0]!.id
  expect((await adapter.search(searchQuery, context)).items).not.toHaveLength(0)
  await expect(adapter.getPlaybackPlan(itemId, context)).resolves.toMatchObject({
    itemId,
    method: expect.stringMatching(/^direct-(play|stream)$/),
  })
  await expect(adapter.reportPlayback({ ...startedReport, itemId }, context))
    .resolves.toBeUndefined()
  await expect(adapter.reportPlayback({ ...stoppedReport, itemId }, context))
    .resolves.toBeUndefined()
})
```

Run with Docker available:

```bash
LUMAROUTE_REQUIRE_CONTAINER=1 \
pnpm --filter @lumaroute/integration test -- jellyfin-contract
```

Expected: no skipped tests; container pulls by digest; authentication, browse, search, playback plan and both report calls PASS.

- [ ] **Step 4: 从 quality 矩阵移除 live 容器硬门**

```yaml
# .github/workflows/quality.yml
- name: Fetch verified mpv sidecar for Rust/Tauri build
  run: node scripts/fetch-mpv.mjs --target "$RUST_TARGET"

- name: Deterministic integration contracts (Jellyfin live deferred)
  run: pnpm --filter @lumaroute/integration exec vitest run --config vitest.config.ts --exclude '**/jellyfin-contract.test.ts'
```

在 job `env` 中同时把 matrix target 显式映射为 `RUST_TARGET`；fetch 必须发生在 `pnpm test:rust` 之前。live Jellyfin 可由后续专门 workflow 或人工命令运行，但不进入本阶段 quality 必过路径。

Run:

```bash
pnpm --filter @lumaroute/integration typecheck
pnpm --filter @lumaroute/integration test
git diff --check
```

Expected: 非 live 集成场景 PASS；普通本地全量集成仍可清楚报告 Jellyfin 环境跳过或失败，但不据此否定 Emby-first Alpha；`git diff --check` 无输出。

- [ ] **Step 5: Commit Jellyfin 延期门禁**

```bash
git add tests/integration/support/jellyfin-container.ts \
  tests/integration/jellyfin-contract.test.ts \
  .github/workflows/quality.yml
git commit -m "ci: defer live Jellyfin from alpha quality"
```

## Task 3: 在原生 runner 真实验证 mpv 样片与 IPC

**可独立验收：** 每个目标平台的已安装 sidecar 都实际执行 H.264、H.265、AV1 软件解码、JSON IPC 启动/加载/暂停/恢复/跳转/停止/结束，并证明敏感请求头不出现在 URL、命令行和日志；提前返回或只运行 `--version` 不算通过。

**Files:**
- Modify: `scripts/verify-mpv.mjs`
- Modify: `scripts/verify-mpv.test.mjs`
- Modify: `apps/desktop/src-tauri/tests/mpv_session.rs`
- Modify: `package.json`

**Interfaces:**
- Consumes: target-suffixed sidecar、`tests/fixtures/media/samples.lock.json`、existing `ipcSmoke`.
- Produces: enhanced `verifyInstalled(target, options)`; `check:mpv:installed` script; fail-closed Rust real-sidecar test when `LUMAROUTE_REQUIRE_REAL_MPV=1`.

- [ ] **Step 1: 写 installed qualification 的失败测试**

```js
// scripts/verify-mpv.test.mjs
it('requires all three controlled codecs for installed qualification', async () => {
  const calls = []
  await verifyInstalledFixture({
    fixtures: 'h264,h265,av1',
    probe: (label) => calls.push(label),
    ipc: () => calls.push('ipc'),
  })
  assert.deepEqual(calls, ['h264', 'h265', 'av1', 'ipc'])
})

it('fails when a selected codec or IPC smoke is skipped', async () => {
  await assert.rejects(
    verifyInstalledFixture({ fixtures: 'h264,h265', ipc: false }),
    /h264,h265,av1 and JSON IPC are required/,
  )
})
```

Run: `node --test scripts/verify-mpv.test.mjs`

Expected: FAIL because installed verification currently checks only version and licenses.

- [ ] **Step 2: 复用受控样片与 IPC 冒烟实现 installed qualification**

```js
// scripts/verify-mpv.mjs
export async function verifyInstalled(
  target = currentRustTarget(),
  options = { fixtures: 'h264,h265,av1', requireIpc: true },
) {
  const manifest = loadManifest()
  const build = manifest.builds[target]
  if (!build) throw new Error(`missing target: ${target}`)
  const sidecar = sidecarPathForTarget(target, build.executable)
  const version = await verifyInstalledBinary(target, sidecar, build.version)
  const selected = await selectRequiredSamples(options.fixtures)
  if (selected.map(sampleName).join(',') !== 'h264,h265,av1' || !options.requireIpc) {
    throw new Error('h264,h265,av1 and JSON IPC are required for Internal Alpha')
  }
  await probeSoftwareDecode(sidecar, selected)
  await ipcSmoke(sidecar, selected)
  verifyLicenseHashes(build)
  console.log(`PASS installed mpv qualification ${version} for ${target}`)
}
```

`probeSoftwareDecode` 必须继续使用 `--no-config --vo=null --ao=null --frames=1 --quiet`；`ipcSmoke` 必须覆盖加载、暂停、恢复、跳转、停止/结束，并在失败时输出错误类别但不输出 header 值或完整私有 URL。

CLI wiring:

```js
if (command === 'installed') {
  await verifyInstalled(args.target || currentRustTarget(), {
    fixtures: args.fixtures || 'h264,h265,av1',
    requireIpc: args.ipc !== 'false',
  })
  return
}
```

Run after fetching current target:

```bash
pnpm fetch:mpv
node scripts/verify-mpv.mjs installed \
  --target aarch64-apple-darwin \
  --fixtures h264,h265,av1
```

Expected on the current Apple Silicon host: output includes `PASS H.264 software decode`, `PASS H.265 software decode`, `PASS AV1 software decode`, `PASS JSON IPC startup/load/pause/seek/stop/end`, `PASS headers absent from process arguments and logs`, and final installed qualification PASS. Any unavailable codec is a recorded blocker, not an automatic skip.

- [ ] **Step 3: 让 Rust 真实 sidecar 测试在 CI 中 fail closed**

```rust
// apps/desktop/src-tauri/tests/mpv_session.rs
#[tokio::test]
async fn real_packaged_mpv_creates_ipc_socket_when_required() {
    let sidecar = packaged_sidecar_path();
    if !sidecar.is_file() {
        if std::env::var("LUMAROUTE_REQUIRE_REAL_MPV").as_deref() == Ok("1") {
            panic!("required packaged mpv sidecar missing at {}", sidecar.display());
        }
        eprintln!("skip: packaged mpv sidecar missing at {}", sidecar.display());
        return;
    }
    let runtime_dir = tempfile_runtime_dir();
    let mut session = MpvSession::start_with_executable(&runtime_dir, &sidecar)
        .await
        .expect("real packaged mpv must create IPC");
    assert!(endpoint_exists(session.endpoint_display()).await);
    session.stop().await.expect("stop real mpv");
}
```

Run:

```bash
LUMAROUTE_REQUIRE_REAL_MPV=1 \
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
  --test mpv_session real_packaged_mpv_creates_ipc_socket_when_required -- --nocapture
```

Expected: PASS only when fetched target sidecar starts and exposes IPC；sidecar 缺失时 FAIL，不能显示为通过。

- [ ] **Step 4: 添加根命令并回归**

```json
// package.json
{
  "scripts": {
    "check:mpv:installed": "node scripts/verify-mpv.mjs installed --fixtures h264,h265,av1"
  }
}
```

Run:

```bash
node --test scripts/verify-mpv.test.mjs
pnpm check:mpv:installed
pnpm test:rust
git diff --check
```

Expected: verifier tests PASS；当前原生 mpv 三样片与 IPC PASS；Rust tests PASS；diff check 无输出。

- [ ] **Step 5: Commit 真实 mpv 验证**

```bash
git add scripts/verify-mpv.mjs \
  scripts/verify-mpv.test.mjs \
  apps/desktop/src-tauri/tests/mpv_session.rs \
  package.json
git commit -m "test: qualify real mpv for internal alpha"
```

## Task 4: 收紧三平台打包、校验和与 Alpha 标记

**可独立验收：** Windows x64 生成 MSI/NSIS EXE，macOS Apple Silicon 生成 DMG；三个安装包各有可验证 SHA-256 sibling，两个 active runner 都先执行真实 mpv qualification 和自动启动冒烟，产物包含明确 Internal Alpha 限制标记。Linux 与 macOS Intel 打包延期。

**Files:**
- Modify: `scripts/package-checksums.mjs`
- Create: `scripts/package-checksums.test.mjs`
- Modify: `scripts/smoke-packaged.mjs`
- Create: `scripts/smoke-packaged.test.mjs`
- Modify: `.github/workflows/package.yml`
- Modify only if build proves icon references invalid: `apps/desktop/src-tauri/tauri.conf.json`
- Create only if build proves icon references invalid: platform icon files listed in the exact file inventory

**Interfaces:**
- Consumes: Tauri bundle output, verified sidecar, expected artifact set per `RUST_TARGET`.
- Produces: exact artifact-count assertions, verified checksum siblings, `UNSIGNED-DEVELOPMENT-BUILD.txt` with four Internal Alpha warnings, uploaded artifacts.

- [ ] **Step 1: 写产物集合、checksum 内容和标记文本的失败测试**

```js
// scripts/smoke-packaged.test.mjs
it('requires the exact artifact family for each target', () => {
  assert.deepEqual(expectedExtensions('x86_64-pc-windows-msvc'), ['.msi', '-setup.exe'])
  assert.deepEqual(expectedExtensions('x86_64-apple-darwin'), ['.dmg'])
  assert.deepEqual(expectedExtensions('aarch64-apple-darwin'), ['.dmg'])
  assert.deepEqual(expectedExtensions('x86_64-unknown-linux-gnu'), ['.AppImage', '.deb'])
})

it('requires all four Internal Alpha warnings', () => {
  assert.doesNotThrow(() => validateAlphaMarker([
    'UNSIGNED OR UNNOTARIZED',
    'INTERNAL TECHNICAL VALIDATION ONLY',
    'OPERATING SYSTEM SECURITY WARNINGS MAY APPEAR',
    'NOT FOR PUBLIC END-USER DISTRIBUTION',
  ].join('\n')))
})
```

```js
// scripts/package-checksums.test.mjs
it('verifies a sibling checksum against artifact bytes', async () => {
  const artifact = await fixtureArtifact('alpha')
  await writeChecksum(artifact, root)
  await assert.doesNotReject(() => verifyChecksumSibling(artifact, root))
  await writeFile(artifact, 'changed')
  await assert.rejects(() => verifyChecksumSibling(artifact, root), /checksum mismatch/)
})
```

Run: `node --test scripts/package-checksums.test.mjs scripts/smoke-packaged.test.mjs`

Expected: FAIL because scripts currently have no importable exact-set/marker/checksum validation functions.

- [ ] **Step 2: 实现 fail-closed 产物和标记验证**

```js
// scripts/package-checksums.mjs
export const ALPHA_MARKER_LINES = [
  'LumaRoute v0.1 Internal Alpha',
  'UNSIGNED OR UNNOTARIZED',
  'INTERNAL TECHNICAL VALIDATION ONLY',
  'OPERATING SYSTEM SECURITY WARNINGS MAY APPEAR',
  'NOT FOR PUBLIC END-USER DISTRIBUTION',
]

export async function verifyChecksumSibling(artifact, root) {
  const sibling = `${artifact}.sha256`
  if (!existsSync(sibling)) throw new Error(`missing checksum sibling: ${sibling}`)
  const [recorded, relativeName] = readFileSync(sibling, 'utf8').trim().split(/\s{2,}/)
  if (relativeName !== relative(root, artifact)) throw new Error(`checksum path mismatch: ${artifact}`)
  const actual = await sha256File(artifact)
  if (recorded !== actual) throw new Error(`checksum mismatch: ${artifact}`)
}
```

`smoke-packaged.mjs` 对目标所需每一种扩展至少找到一个文件，否则失败；找到后逐一调用 checksum verifier。移除“没有安装包时只警告”的成功路径；package workflow 中没有安装包必须非零退出。

Run: `node --test scripts/package-checksums.test.mjs scripts/smoke-packaged.test.mjs`

Expected: PASS。

- [ ] **Step 3: 调整 package workflow 顺序与真实门禁**

```yaml
# .github/workflows/package.yml — relevant ordered steps
- run: pnpm install --frozen-lockfile
- run: node scripts/fetch-mpv.mjs --target "$RUST_TARGET"
- name: Qualify installed mpv with controlled samples and JSON IPC
  run: node scripts/verify-mpv.mjs installed --target "$RUST_TARGET" --fixtures h264,h265,av1
- name: Require real sidecar Rust smoke
  run: cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test mpv_session -- --nocapture
  env:
    LUMAROUTE_REQUIRE_REAL_MPV: '1'
- name: Build unsigned desktop packages
  run: pnpm --filter @lumaroute/desktop tauri build --target "$RUST_TARGET" $BUNDLE_ARGS
- run: node scripts/package-checksums.mjs apps/desktop/src-tauri/target
- run: node scripts/smoke-packaged.mjs --target "$RUST_TARGET"
```

checksum 生成必须在 smoke 之前；当前 workflow 的 smoke/checksum 顺序相反，执行时必须修正。上传路径继续包含 MSI、`-setup.exe`、DMG、AppImage、deb、`.sha256` 和 marker。

Run locally for current target:

```bash
pnpm --filter @lumaroute/desktop tauri build --target aarch64-apple-darwin --bundles app,dmg
node scripts/package-checksums.mjs apps/desktop/src-tauri/target
node scripts/smoke-packaged.mjs --target aarch64-apple-darwin
```

Expected: Apple Silicon `.dmg`、其 `.sha256` 和 Internal Alpha marker 全部通过；如果 Tauri 因现有 icon 引用失败，进入 Step 4，不能跳过 bundle 构建或伪造产物。

- [ ] **Step 4: 仅在真实构建失败时修复已证实的 icon 阻塞**

若 Step 3 报告缺少当前 `tauri.conf.json` 中的 icon，使用 Tauri 官方图标生成命令从仓库已有的非敏感 LumaRoute 源图生成全套平台图标，并移除异常的 `icons/henry.w@example.net` 引用：

```bash
pnpm --filter @lumaroute/desktop tauri icon apps/desktop/src-tauri/icons/icon.png
```

配置最小结果：

```json
{
  "bundle": {
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

Expected: 只提交 Tauri 实际生成并被配置引用的图标；如果仓库没有合法源图，停止任务并报告 blocker，不临时下载或生成品牌资产。

- [ ] **Step 5: 回归脚本与当前平台 package**

Run:

```bash
node --test scripts/package-checksums.test.mjs scripts/smoke-packaged.test.mjs
node --test scripts/verify-mpv.test.mjs
node scripts/verify-mpv.mjs installed --target aarch64-apple-darwin --fixtures h264,h265,av1
node scripts/smoke-packaged.mjs --target aarch64-apple-darwin
git diff --check
```

Expected: 所有脚本测试 PASS；真实 mpv qualification PASS；DMG、checksum、marker PASS；diff check 无输出。

- [ ] **Step 6: Commit 打包门禁**

```bash
git add scripts/package-checksums.mjs \
  scripts/package-checksums.test.mjs \
  scripts/smoke-packaged.mjs \
  scripts/smoke-packaged.test.mjs \
  .github/workflows/package.yml \
  apps/desktop/src-tauri/tauri.conf.json \
  apps/desktop/src-tauri/icons
git commit -m "build: enforce internal alpha package evidence"
```

若 Step 4 未触发，不要把未改动的 `tauri.conf.json` 或 icons 加入提交。

## Task 5: 跑通质量与打包 CI 并记录自动化证据

**可独立验收：** 当前提交的双平台 quality matrix 在不要求 live Jellyfin、Linux 或 macOS Intel 的前提下全绿；package matrix 两个 job 全绿并上传三个约定安装包、checksum 和 marker；Windows 与 Apple Silicon mpv 目标有原生 runner 的真实 qualification 日志。Linux 与 Intel 保持未证明。

**Files:**
- Modify: `.github/workflows/quality.yml`
- Modify: `.github/workflows/package.yml`
- Modify only from measured native results: `apps/desktop/src-tauri/resources/mpv/mpv.lock.json`
- Modify: `docs/release/v0.1-acceptance.md`

**Interfaces:**
- Consumes: Tasks 1–4 tests/scripts/workflows, GitHub Actions run URLs and artifacts.
- Produces: green quality/package run URLs and exact automated-evidence entries in the sole acceptance document.

- [ ] **Step 1: 本地运行完整质量门**

Run:

```bash
pnpm check
pnpm test:integration
pnpm test:e2e
git diff --check
```

Expected: `pnpm check`、非容器集成场景和 Playwright 全部 PASS；live Jellyfin 的 skip 或失败只记录为 deferred，不计作 Emby-first Alpha 通过证据，也不阻塞本阶段；diff check 无输出。

- [ ] **Step 2: 推送任务分支并触发 quality**

执行者按仓库正常 PR 流程推送包含 Tasks 1–4 commits 的任务分支，然后：

```bash
gh workflow run quality.yml --ref "$(git branch --show-current)"
gh run list --workflow quality.yml --branch "$(git branch --show-current)" --limit 1
```

Expected: 最新 run 对应 `git rev-parse HEAD`；Windows、macOS Apple Silicon 两个 job 全绿；两个 active 平台都在 Rust 测试前成功 fetch 对应 sidecar；quality 不运行 deferred live Jellyfin、Linux 或 macOS Intel。

若 run 失败：

```bash
gh run view "$(gh run list --workflow quality.yml --branch "$(git branch --show-current)" --limit 1 --json databaseId --jq '.[0].databaseId')" --log-failed
```

只修复阻止现有 v0.1 契约的缺陷，回到对应任务补失败测试；不得把失败项改成 `continue-on-error` 或跳过。

- [ ] **Step 3: 触发 package 并验证 artifact 清单**

```bash
gh workflow run package.yml --ref "$(git branch --show-current)"
gh run list --workflow package.yml --branch "$(git branch --show-current)" --limit 1
```

Expected: 两个 matrix job 全绿：

```text
x86_64-pc-windows-msvc: .msi + -setup.exe + each .sha256 + marker
aarch64-apple-darwin: .dmg + .sha256 + marker
```

下载到临时目录并离线复核：

```bash
RUN_ID="$(gh run list --workflow package.yml --branch "$(git branch --show-current)" --limit 1 --json databaseId --jq '.[0].databaseId')"
rm -rf /tmp/lumaroute-alpha-artifacts
gh run download "$RUN_ID" --dir /tmp/lumaroute-alpha-artifacts
python3 - <<'PY'
from pathlib import Path
import hashlib

root = Path('/tmp/lumaroute-alpha-artifacts')
artifacts = [
    p for p in root.rglob('*')
    if p.is_file() and (
        p.suffix.lower() in {'.msi', '.dmg', '.appimage', '.deb'}
        or p.name.endswith('-setup.exe')
    )
]
assert artifacts, 'no package artifacts downloaded'
for artifact in artifacts:
    sibling = Path(f'{artifact}.sha256')
    assert sibling.is_file(), f'missing {sibling}'
    expected = sibling.read_text().split()[0]
    actual = hashlib.sha256(artifact.read_bytes()).hexdigest()
    assert actual == expected, f'checksum mismatch: {artifact}'
print(f'PASS verified {len(artifacts)} package checksum(s)')
PY
```

Expected: `PASS verified 3 package checksum(s)`（Windows 2、Apple Silicon macOS 1）。Linux AppImage/deb 与 macOS Intel DMG 不属于本阶段硬门。以实际安装包及逐文件 SHA-256 校验结果为准，不得漏验或伪造计数。

- [ ] **Step 4: 只从 CI 实测更新 mpv 资格状态**

每个 package job 日志必须含三种软件解码、JSON IPC、header 泄漏和 license 检查 PASS。只有对应原生 job 全部通过，才允许把该 target 的 `qualificationStatus` 从 `archive-sealed` 改为 `qualified`，并把 GitHub Actions 完成时间写入 `qualifiedAt`；version/source/SHA-256 不应因状态更新改变。

Run: `node scripts/verify-mpv.mjs manifest`

Expected: `PASS mpv.lock.json manifest`；Windows 与 Apple Silicon 有可追溯原生 qualification run。`x86_64-unknown-linux-gnu` 与 `x86_64-apple-darwin` 保持现有未证明状态，不改成 `qualified`。

- [ ] **Step 5: 重写自动化验收区为 Internal Alpha 证据**

```markdown
<!-- docs/release/v0.1-acceptance.md — exact structure -->
## Internal Alpha automated evidence

- [x] Full quality gate.
  - Evidence: `pnpm check`, integration, E2E, Rust and four-platform quality jobs; use the exact successful quality run URL.
  - Limitations: none
- [x] Playback startup failure regenerates, loads, and reports with the backup-line plan.
  - Evidence: `tests/integration/playback-startup-failover.test.ts`; use the same successful quality run URL.
  - Limitations: pre-start only; playback interruption failover is out of scope.
- [ ] Temporary Jellyfin live contract is deferred.
  - Evidence: not required for this Emby-first Internal Alpha.
  - Limitations: live container and real-system validation deferred; adapter and fixed-fixture tests remain.
- [x] Real mpv decodes H.264/H.265/AV1 and completes JSON IPC controls/events on active package runners.
  - Evidence: installed qualification logs; use the exact successful package run URL.
  - Limitations: software decode is allowed; high-bitrate hardware performance is not claimed; Linux and Intel remain unproven.
- [x] Windows x64 and macOS Apple Silicon artifacts have verified SHA-256 siblings.
  - Evidence: package artifact download and checksum verification; use the exact successful package run URL.
  - Limitations: unsigned/unnotarized Internal Alpha only.
- [x] Credential leakage scan returns zero findings.
  - Evidence: `pnpm check:sensitive` in the successful quality run.
  - Limitations: test fixtures and generated diagnostics only; private tester credentials never enter CI.
```

将“use the exact successful … URL”替换为 Step 2/3 命令实际返回的完整 URL 后再提交；该短语不能保留在最终验收文档。保留尚未完成的实机项为 `- [ ]` 并写明 `Evidence: not yet executed` 和实际环境限制；不要提前勾选。

- [ ] **Step 6: 验证记录不含凭证并 Commit CI 证据**

Run:

```bash
pnpm check:sensitive -- docs/release/v0.1-acceptance.md
node scripts/verify-mpv.mjs manifest
git diff --check
```

Expected: sensitive scan zero findings；manifest PASS；diff check 无输出。

```bash
git add .github/workflows/quality.yml \
  .github/workflows/package.yml \
  apps/desktop/src-tauri/resources/mpv/mpv.lock.json \
  docs/release/v0.1-acceptance.md
git commit -m "ci: record internal alpha automation evidence"
```

如果 mpv manifest 没有实测状态变化，不要把它加入提交。

## Task 6: 完成 macOS 与 Windows 的 Emby 实机矩阵

**可独立验收：** macOS Apple Silicon 与 Windows x64 分别用 Emby 完成两个独立组合；每个组合验证安装、首次启动或安全凭证读取、浏览/详情、直放或不转码直接串流、暂停/恢复/跳转/停止、五类进度回写、退出后的 mpv/IPC 清理和卸载。Jellyfin 组合与 macOS Intel 组合保持未勾选并标记 deferred。私人地址、用户名、Token 不进入记录。

**Files:**
- Modify: `docs/release/v0.1-acceptance.md`

**Interfaces:**
- Consumes: Task 5 package run 的 exact artifact、SHA-256、Internal Alpha marker；测试人员本地安全环境中的 Emby。
- Produces: 两条 Emby 实机组合证据，以及两条保持未勾选的 Jellyfin deferred 记录；实际执行项都有日期、完整 OS 版本、安装包文件名或 artifact ID、结果和非敏感限制。

- [ ] **Step 1: 在验收文档加入四个未通过的精确检查项**

```markdown
## Internal Alpha real-system matrix

- [ ] macOS Apple Silicon × Emby
  - Evidence: not yet executed
  - Required: install; first launch or credential read; browse/detail; direct play or remux; pause/resume/seek/stop; started/progress/paused/seeked/stopped write-back; app-exit mpv/IPC cleanup; uninstall
  - Limitations: execution environment not yet supplied
- [ ] macOS × Jellyfin
  - Evidence: deferred from Emby-first Internal Alpha
  - Required: same closed loop as macOS Apple Silicon × Emby in a later compatibility stage
  - Limitations: not an Internal Alpha hard gate
- [ ] macOS Intel × Emby/Jellyfin
  - Evidence: deferred because a `macos-13` runner is unavailable
  - Required: native Intel CI and real-system evidence in a later compatibility stage
  - Limitations: Apple Silicon evidence is not an Intel substitute
- [ ] Windows x64 × Emby
  - Evidence: not yet executed
  - Required: same closed loop as macOS Apple Silicon × Emby
  - Limitations: execution environment not yet supplied
- [ ] Windows x64 × Jellyfin
  - Evidence: deferred from Emby-first Internal Alpha
  - Required: same closed loop as macOS Apple Silicon × Emby in a later compatibility stage
  - Limitations: not an Internal Alpha hard gate
```

Run: `pnpm check:sensitive -- docs/release/v0.1-acceptance.md`

Expected: zero findings。

- [ ] **Step 2: 核对并安装 exact artifacts**

每台机器先验证 checksum：

```bash
# macOS: first argument is the downloaded DMG path
ARTIFACT="$1"
shasum -a 256 -c "${ARTIFACT}.sha256"
```

```powershell
# Windows PowerShell: first argument is the downloaded MSI or NSIS path
$Artifact = $args[0]
$expected = (Get-Content "$Artifact.sha256").Split()[0]
$actual = (Get-FileHash $Artifact -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $expected) { throw "SHA-256 mismatch" }
```

Expected: 每个使用的 artifact 校验成功；marker 明确显示未签名/未公证、内部技术验证、安全警告和非公开分发。OS 安全警告允许出现，但不得绕过系统安全设置以外的产品逻辑。

- [ ] **Step 3: 执行每个平台与服务端组合的播放闭环**

每个组合严格按以下顺序记录结果：

```text
1. 安装 package，记录测试日期、完整 OS 版本、artifact 名称和 SHA-256。
2. 首次启动登录，或读取先前已保存的系统安全凭证。
3. 浏览媒体库并打开媒体详情。
4. 启动原文件直放或不重新编码的直接串流，记录服务端显示的播放方法。
5. 暂停、恢复、跳转、停止。
6. 在服务端验证 Started、Progress、Paused、Seeked、Stopped 和最终位置。
7. 再次播放后退出 LumaRoute，确认 mpv 进程退出且随机 IPC 端点被删除。
8. 卸载，确认应用可移除；凭证清理行为只按现有 v0.1 契约验证，不新增迁移/升级能力。
```

Expected: macOS Apple Silicon × Emby 与 Windows x64 × Emby 两个组合完成；Jellyfin 与 macOS Intel 项保持 deferred。进度通常与本地位置相差不超过 10 秒。硬件解码不可用时允许软件解码；无法播放时记录 OS、mpv build、媒体 codec 和脱敏错误类别，不记录 URL、用户名或 Token。

- [ ] **Step 4: 将真实结果写回唯一验收文档**

通过项格式：

```markdown
- [x] macOS Apple Silicon × Emby
  - Evidence: 2026-08-21; macOS 15.x (exact patch recorded at execution); exact DMG filename from package run; install/playback/write-back/cleanup/uninstall PASS
  - Limitations: unsigned and unnotarized Internal Alpha; OS warning observed
```

执行时必须把示例日期、OS 和文件名替换为机器实际值；如果任一步失败，保持 `- [ ]`，写明确阶段、稳定错误类别、mpv build 和非敏感原因。禁止使用“基本通过”“待确认”或私人服务地址。

- [ ] **Step 5: 扫描记录并 Commit 实机证据**

Run:

```bash
pnpm check:sensitive -- docs/release/v0.1-acceptance.md
git diff --check
```

Expected: zero findings；diff check 无输出；两个 active Emby 组合都有实际证据或明确不通过原因，Jellyfin 与 macOS Intel 明确标记 deferred。

```bash
git add docs/release/v0.1-acceptance.md
git commit -m "docs: record internal alpha system validation"
```

## Task 7: 执行最终 Alpha 门并封存验收结论

**可独立验收：** 当前 HEAD 的双平台本地/CI 质量门、package CI、artifact checksum、macOS Apple Silicon/Windows 两个 Emby 实机组合、真实 mpv 和泄漏扫描均有可追溯证据；Jellyfin live/实机、Linux quality/package 与 macOS Intel 项明确延期。只有当前硬门全部通过时文档才写 `Internal Alpha: PASS`。

**Files:**
- Modify: `docs/release/v0.1-acceptance.md`

**Interfaces:**
- Consumes: Tasks 1–6 的 committed HEAD、green run URLs、实机记录。
- Produces: 单一、可审计的 Internal Alpha 最终结论；不创建公开 Release，不签名/公证，不合并 v0.2。

- [ ] **Step 1: 从 clean checkout 重跑本地可执行门**

Run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:integration
pnpm test:e2e
pnpm check:sensitive -- docs/release/v0.1-acceptance.md
git diff --check
git status --short
```

Expected: 所有非 live 硬门命令 PASS；`git diff --check` 无输出；`git status --short` 只显示本任务对 acceptance 文档的预期修改。live Jellyfin skip 或失败记录为 deferred，不阻塞本次结论。

- [ ] **Step 2: 核对 CI run 与 HEAD 一致**

```bash
HEAD_SHA="$(git rev-parse HEAD)"
gh run list --workflow quality.yml --commit "$HEAD_SHA" --limit 1 \
  --json status,conclusion,url,headSha
gh run list --workflow package.yml --commit "$HEAD_SHA" --limit 1 \
  --json status,conclusion,url,headSha
```

Expected: 两个 workflow 都是 `status=completed`、`conclusion=success` 且 `headSha` 等于 `HEAD_SHA`。如果文档更新 commit 使 HEAD 前移，可接受 workflow 对应其直接父提交，但文档必须明确记录被验证的代码 SHA；不要把旧的失败 run 32022148857 当成当前证据。

- [ ] **Step 3: 逐项执行最终七门检查**

```text
1. Full quality gate: successful run URL and tested code SHA present.
2. Playback startup backup-plan integration: dedicated test present and green.
3. Packages: three required installers and three valid checksum siblings present.
4. Real systems: macOS Apple Silicon/Windows × Emby two combinations passed.
5. Real mpv: H.264/H.265/AV1 + JSON IPC evidence for both active package targets, or a documented hardware limitation that does not invalidate software decode.
6. Credential leakage: zero findings in current quality run and acceptance document scan.
```

Expected: 六项全部有证据。任一缺失则最终结论必须是 `BLOCKED`，并保留未勾选项和明确原因。

- [ ] **Step 4: 写最终结论**

全部通过时：

```markdown
## Internal Alpha decision

**Status:** PASS

**Scope:** Unsigned/unnotarized internal technical validation only. Not for public end-user distribution.

**Validated code:** exact tested git SHA

**Automation:** exact successful quality and package run URLs

**System evidence:** macOS Apple Silicon/Windows × Emby entries above; Jellyfin, Linux, and macOS Intel deferred

**Deferred public-release gates:** signing, notarization, public license declaration, automatic updates, and public GitHub Release.
```

有阻塞时：

```markdown
## Internal Alpha decision

**Status:** BLOCKED

**Scope:** No Internal Alpha approval; no public distribution.

**Blocking evidence:** list only the exact unchecked acceptance items and their recorded non-sensitive reasons.
```

执行时将 `exact ...` 描述替换为实际 SHA、URL 或检查项；最终文档不得保留该字样。

- [ ] **Step 5: 最终验证并 Commit 验收结论**

Run:

```bash
pnpm check:sensitive -- docs/release/v0.1-acceptance.md
git diff --check
```

Expected: zero findings；diff check 无输出。

```bash
git add docs/release/v0.1-acceptance.md
git commit -m "docs: close the v0.1 internal alpha gate"
```

不要创建 tag、GitHub Release、签名或公证任务；不要合并 v0.2。

## Plan Author Self-Review Record

- [x] Spec §1：Tasks 1–7 分别覆盖 Emby-first 闭环、真实 mpv、Windows/Apple Silicon 产物、专用播放启动换线和唯一验收记录；Jellyfin live、Linux 与 macOS Intel 证据延期。
- [x] Spec §2：Global Constraints 与 Task 7 明确排除 v0.2 控制、播放中换线、转码、聚合、更多来源、签名、公证、更新和公开 Release。
- [x] Spec §3：计划只修改 v0.1 测试、打包、验收和保持现有契约的缺陷；`packages/player` 不在修改清单中；最终门禁止合并 v0.2。
- [x] Spec §4.1：Task 1 专用集成场景覆盖浏览可用后的播放前网络失败、备用线路重建/加载、备用媒体源/会话/进度上下文及全部非重试类别。
- [x] Spec §4.2：Task 2 保留固定 Jellyfin manifest digest 与 live 契约，但从本阶段 Linux quality 硬门移除，skip 或扫描失败不阻塞 Emby-first Alpha。
- [x] Spec §4.3：Task 3 对 H.264/H.265/AV1、启动/加载、暂停/恢复/跳转/停止、事件和敏感 header 泄漏建立 fail-closed 真实 mpv 证据。
- [x] Spec §5：Task 4/5 精确要求 Windows MSI+NSIS、Apple Silicon macOS DMG、每产物 SHA-256 和四条 Internal Alpha 警告；Linux 与 macOS Intel 延期。
- [x] Spec §6：Task 6 覆盖 macOS Apple Silicon、Windows x64 的两个 Emby 组合及登录/凭证、浏览详情、直放/直接串流、控制、回写、清理、卸载；Jellyfin 与 macOS Intel 组合延期。
- [x] Spec §7：所有实现步骤只允许现有 v0.1 契约缺陷修复；Rust 使用稳定 `PlayerUnavailable` / `PlaybackFailed`；没有新增架构。
- [x] Spec §8：Tasks 5–7 只修改 `docs/release/v0.1-acceptance.md` 作为唯一记录，每项要求 CI URL 或日期/OS/artifact/结果或明确限制。
- [x] Internal Alpha 六项最终条件在 Task 7 一一对应，Jellyfin live/实机、Linux quality/package、macOS Intel CI/实机、签名、公证、公开许可证声明和普通用户分发明确延期且不阻塞内部 Alpha。
- [x] 当前仓库事实：记录了本机 Docker 不可用、Jellyfin skip、真实 sidecar 测试提前返回、quality run 失败、package 零运行、mpv 三目标仅 archive-sealed 和潜在 icon 打包阻塞；没有声称 CI/容器/mpv/package 已通过。
- [x] 类型一致性：`PlaybackService.play`、`PlaybackPlan`、`PlayerEngine`、`NativeError`、`IntegrationApp`、`JELLYFIN_IMAGE`、`verifyInstalled` 在接口与任务中命名一致；未引入未定义的业务类型。
- [x] 任务顺序：错误契约与专用集成 → 记录 Jellyfin 延期 → 真实 mpv → package 门 → CI 证据 → Emby 实机矩阵 → 最终判定；后续任务只消费前序产物。
- [x] 精确文件清单：每个计划修改路径都在顶部清单中；条件文件只在真实构建证明需要时修改，避免无依据的 UI/品牌改动。
- [x] TDD：所有代码行为任务先有明确失败测试和预期失败原因，再有最小实现和精确绿灯命令；纯运行/验收任务提供 fail-closed 判定。
- [x] Placeholder scan：未发现未决标记、空实现指令、跨任务省略引用或需要执行者自行猜测的代码步骤；文档示例中的执行时字段都要求以命令实际值替换并设有最终扫描门。
- [x] 范围检查：没有 v0.2 播放控制、UI 美化、公开发布或不相关重构。
