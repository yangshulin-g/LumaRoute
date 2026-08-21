# LumaRoute v0.2 Player Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变独立 mpv 进程、受限 JSON IPC、服务端适配器、线路策略和进度上报边界的前提下，为 LumaRoute 增加音量/静音、mpv 窗口全屏、音轨、字幕轨和章节基础控制。

**Architecture:** `packages/player` 扩展稳定领域契约；`apps/desktop` 的 `TauriPlayerEngine`、Pinia store 和 Vue 控件只消费具名接口与稳定事件；`apps/desktop/src-tauri` 通过具名 Tauri 命令、`PlayerControl` 枚举和固定 mpv 属性允许列表执行控制。高频控制状态由 `property-change` 事件驱动，低频轨道/章节变化只发失效通知并由前端合并后读取完整快照；不引入轮询、libmpv、通用命令或属性透传。

**Tech Stack:** Vue 3、TypeScript 5.9、Pinia 4、Vitest 4、Vue Test Utils、Playwright、Tauri 2、Rust stable、Tokio、serde/serde_json、独立 mpv JSON IPC、现有 fake mpv。

## Global Constraints

- 前置门禁固定为：v0.1 Internal Alpha 通过后才可合并；v0.2 可在独立分支并行开发，但不得进入 v0.1 Alpha 验收基线。
- 合并 v0.2 前必须重新运行完整 v0.1 Alpha 回归，并在 `docs/release/v0.2-player-basics-acceptance.md` 记录证据。
- 播放器继续使用独立 mpv 进程和受限 JSON IPC；不内嵌 mpv 画面，不迁移 libmpv Render API，不引入 Go sidecar。
- 不增加 `command(name, args)`、`setProperty(name, value)` 或任何等价通用接口；WebView 只能调用本计划列出的 `PlayerEngine` 具名方法和 Tauri 具名命令。
- Rust 只允许本阶段固定属性 `volume`、`mute`、`fullscreen`、`aid`、`sid`、`chapter`、`track-list`、`chapter-list`，并保留 v0.1 已允许的 `http-header-fields`、`pause`、`time-pos`、`duration`、`path`、`idle-active`。
- 音量范围固定为 `0..100`；TypeScript 与 Rust 边界都拒绝非有限数值和越界值。
- 音轨 ID、字幕轨 ID 去除首尾空白后不能为空；字幕关闭只使用 `selectSubtitleTrack(null)` 并映射到 mpv `sid=no`。
- 章节索引必须是非负整数；章节跳转使用 mpv `chapter` 属性，不用基于标题或时间的模糊匹配。
- mpv 缺失轨道/章节字段统一映射为 `null`、`false` 或空数组；前端不得解析原始 `track-list`、`chapter-list`、`aid`、`sid` 或 `chapter`。
- 播放位置、暂停、音量、静音和全屏通过事件持续同步；订阅建立后只读取一次初始快照，禁止固定间隔播放器状态轮询。
- 音轨、字幕轨和章节是低频结构数据；文件加载或 `track-list`、`chapter-list`、`aid`、`sid`、`chapter` 变化只发 `media-info-changed`，前端合并通知后调用一次 `getMediaInfo()`。
- 完整轨道和章节数组不得进入位置事件或控制状态事件。
- 当前选择只以 mpv 事件/快照为事实来源；控制命令不得永久乐观覆盖本地状态。
- 无活跃播放会话时所有新增控件禁用且不发送命令；原生边界返回 `PlayerUnavailable`。
- 旧轨道 ID 失效时刷新 `PlayerMediaInfo`、显示“媒体轨道已变化，请重新选择”，不停止播放。
- IPC 断开或 mpv 退出沿用 `PlaybackFailed`，保留既有最后位置与重试动作。
- Token、播放 URL、请求头、私人服务器地址和字幕文本不得进入日志、错误、命令行、普通配置或测试输出。
- 不改变 Emby/Jellyfin 适配器、播放计划、播放启动换线、直放/直接串流和十秒进度上报契约。
- 不实现在线字幕搜索/下载、外挂字幕文件管理、HDR、音频直通设置、Shader、Anime4K、RIFE、播放中断自动换线、画中画、复杂多窗口或自定义 mpv 参数界面。
- 所有行为变更遵循失败测试 → 确认红灯 → 最小实现 → 确认绿灯；每个任务都以独立可评审提交结束。
- 生产文件继续遵守单一职责；若 `protocol.rs`、`session.rs`、`player-store.ts` 或 `PlayerControls.vue` 因本阶段超过约 250 行，按本计划指定的新文件拆分，不建立全能模块。

---

## 事实来源与执行约定

- 产品、架构、范围和验收事实来源：`docs/superpowers/specs/2026-08-21-lumaroute-v0.2-player-basics-design.md`。
- 基线架构来源：`docs/superpowers/specs/2026-08-07-lumaroute-v0.1-design.md` 与 `docs/superpowers/plans/2026-08-07-lumaroute-v0.1-implementation.md`。
- 合并门禁来源：`docs/superpowers/specs/2026-08-21-lumaroute-v0.1-internal-alpha-design.md`。
- 执行前读取根目录 `AGENTS.md` 与匹配的 `.cursor/rules/typescript-boundaries.mdc`、`.cursor/rules/rust-boundary.mdc`。
- 在独立分支或 worktree 执行本计划；不得把 v0.2 提交混入 v0.1 Alpha 收口分支。
- v0.1 收口发现的协议缺陷先在 v0.1 基线最小修复，再将对应提交同步到 v0.2 分支；不得在两个分支分别发明不同协议。
- 每个任务的提交步骤仅供实施阶段执行；创建本计划的会话不执行提交。

## 精确文件清单

### Player 领域契约

- Modify: `packages/player/src/types.ts`
- Modify: `packages/player/src/player-engine.ts`
- Modify: `packages/player/src/player-engine.test.ts`
- Modify: `packages/player/src/index.ts`
- Modify: `packages/core/src/playback/progress-reporter.ts`
- Modify: `packages/core/src/playback/progress-reporter.test.ts`

### Desktop TypeScript、Pinia 与 Vue

- Modify: `apps/desktop/src/platform/player/tauri-player-engine.ts`
- Modify: `apps/desktop/src/platform/player/tauri-player-engine.test.ts`
- Modify: `apps/desktop/src/platform/player/fake-player-engine.ts`
- Modify: `apps/desktop/src/stores/player-store.ts`
- Modify: `apps/desktop/src/stores/player-store.test.ts`
- Modify: `apps/desktop/src/components/PlayerControls.vue`
- Create: `apps/desktop/src/components/PlayerControls.test.ts`
- Modify: `apps/desktop/src/views/MediaDetailView.test.ts`
- Modify: `apps/desktop/src/composition/create-e2e-services.ts`

### Tauri/Rust 与 fake mpv

- Modify: `apps/desktop/src-tauri/src/error.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands/player.rs`
- Modify: `apps/desktop/src-tauri/src/mpv/protocol.rs`
- Create: `apps/desktop/src-tauri/src/mpv/media_info.rs`
- Modify: `apps/desktop/src-tauri/src/mpv/mod.rs`
- Modify: `apps/desktop/src-tauri/src/mpv/session.rs`
- Modify: `apps/desktop/src-tauri/tests/mpv_session.rs`
- Modify: `tests/integration/support/fake-mpv.mjs`

### 集成、端到端与验收

- Modify: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/player-basics.spec.ts`
- Create: `docs/release/v0.2-player-basics-acceptance.md`

## Stable Interfaces

后续任务只能实现这些名称和字段，不得悄悄改名。TypeScript 使用 camelCase；Rust 字段使用 snake_case 并统一加 `#[serde(rename_all = "camelCase")]`。事件 `type` 的连字符名称使用逐项 `#[serde(rename = "...")]`，不得依赖 `rename_all` 猜测。

```ts
// packages/player/src/types.ts
export interface PlayerControlState {
  volume: number
  muted: boolean
  fullscreen: boolean
}

export interface AudioTrack {
  id: string
  title: string | null
  language: string | null
  codec: string | null
  selected: boolean
  isDefault: boolean
  isForced: boolean
  isExternal: boolean
}

export interface SubtitleTrack {
  id: string
  title: string | null
  language: string | null
  codec: string | null
  selected: boolean
  isDefault: boolean
  isForced: boolean
  isExternal: boolean
}

export interface Chapter {
  index: number
  title: string | null
  startSeconds: number
  selected: boolean
}

export interface PlayerMediaInfo {
  audioTracks: AudioTrack[]
  subtitleTracks: SubtitleTrack[]
  chapters: Chapter[]
}

export type PlayerControlAction =
  | 'set-volume'
  | 'set-muted'
  | 'set-fullscreen'
  | 'select-audio-track'
  | 'select-subtitle-track'
  | 'seek-to-chapter'

export type PlayerEvent =
  | { type: 'started'; positionSeconds: number; durationSeconds: number }
  | { type: 'position'; positionSeconds: number; durationSeconds: number }
  | { type: 'paused'; positionSeconds: number; durationSeconds: number }
  | { type: 'resumed'; positionSeconds: number; durationSeconds: number }
  | { type: 'seeked'; positionSeconds: number; durationSeconds: number }
  | { type: 'ended'; positionSeconds: number; durationSeconds: number }
  | { type: 'stopped'; positionSeconds: number; durationSeconds: number }
  | { type: 'control-state-changed'; state: PlayerControlState }
  | { type: 'media-info-changed' }
  | {
      type: 'control-failed'
      action: PlayerControlAction
      code: 'InvalidTrack' | 'PlaybackFailed'
      message: string
    }
  | { type: 'error'; code: 'PlayerUnavailable' | 'PlaybackFailed'; message: string }
```

```ts
// packages/player/src/player-engine.ts
export interface PlayerEngine {
  play(plan: PlaybackPlan): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  seek(positionSeconds: number): Promise<void>
  stop(): Promise<void>
  setVolume(volume: number): Promise<void>
  setMuted(muted: boolean): Promise<void>
  setFullscreen(fullscreen: boolean): Promise<void>
  selectAudioTrack(trackId: string): Promise<void>
  selectSubtitleTrack(trackId: string | null): Promise<void>
  seekToChapter(chapterIndex: number): Promise<void>
  getControlState(): Promise<PlayerControlState>
  getMediaInfo(): Promise<PlayerMediaInfo>
  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe
}
```

```rust
// apps/desktop/src-tauri/src/mpv/media_info.rs
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePlayerControlState {
    pub volume: f64,
    pub muted: bool,
    pub fullscreen: bool,
}

impl Default for NativePlayerControlState {
    fn default() -> Self {
        Self {
            volume: 100.0,
            muted: false,
            fullscreen: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAudioTrack {
    pub id: String,
    pub title: Option<String>,
    pub language: Option<String>,
    pub codec: Option<String>,
    pub selected: bool,
    pub is_default: bool,
    pub is_forced: bool,
    pub is_external: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSubtitleTrack {
    pub id: String,
    pub title: Option<String>,
    pub language: Option<String>,
    pub codec: Option<String>,
    pub selected: bool,
    pub is_default: bool,
    pub is_forced: bool,
    pub is_external: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeChapter {
    pub index: usize,
    pub title: Option<String>,
    pub start_seconds: f64,
    pub selected: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePlayerMediaInfo {
    pub audio_tracks: Vec<NativeAudioTrack>,
    pub subtitle_tracks: Vec<NativeSubtitleTrack>,
    pub chapters: Vec<NativeChapter>,
}
```

```rust
// additions to apps/desktop/src-tauri/src/mpv/protocol.rs
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(tag = "type")]
pub enum NativePlayerEvent {
    // Existing Started/Position/Paused/Resumed/Seeked/Ended/Stopped/Error variants remain.
    #[serde(rename = "control-state-changed")]
    #[serde(rename_all = "camelCase")]
    ControlStateChanged { state: NativePlayerControlState },
    #[serde(rename = "media-info-changed")]
    MediaInfoChanged,
    #[serde(rename = "control-failed")]
    #[serde(rename_all = "camelCase")]
    ControlFailed {
        action: String,
        code: String,
        message: String,
    },
}
```

```text
Tauri command                         TypeScript invocation arguments
player_set_volume(volume: f64)        { volume }
player_set_muted(muted: bool)         { muted }
player_set_fullscreen(fullscreen)      { fullscreen }
player_select_audio_track(track_id)    { trackId }
player_select_subtitle_track(track_id) { trackId }
player_seek_to_chapter(chapter_index)  { chapterIndex }
player_get_control_state()             none
player_get_media_info()                none
```

## Task 1: 扩展稳定 PlayerEngine 领域契约

**可独立验收：** `packages/player` 发布完整控制/媒体类型和具名方法；`ProgressReporter` 明确忽略控制类事件，证明音量、全屏、轨道和章节变化不会产生服务端进度上报。

**Files:**
- Modify: `packages/player/src/types.ts`
- Modify: `packages/player/src/player-engine.ts`
- Modify: `packages/player/src/player-engine.test.ts`
- Modify: `packages/player/src/index.ts`
- Modify: `packages/core/src/playback/progress-reporter.ts`
- Modify: `packages/core/src/playback/progress-reporter.test.ts`

**Interfaces:**
- Consumes: existing `PlaybackPlan`, time-bearing v0.1 `PlayerEvent`, `ProgressReporter`.
- Produces: all TypeScript interfaces in Stable Interfaces; `isPlaybackTimelineEvent(event): event is PlaybackTimelineEvent`.

- [ ] **Step 1: Write failing contract and progress-isolation tests**

```ts
// packages/player/src/player-engine.test.ts
import { expectTypeOf, it } from 'vitest'
import type {
  AudioTrack,
  Chapter,
  PlayerControlState,
  PlayerEngine,
  PlayerMediaInfo,
  SubtitleTrack,
} from './index'

it('publishes only named player-basic capabilities', () => {
  expectTypeOf<PlayerEngine['setVolume']>().parameters.toEqualTypeOf<[number]>()
  expectTypeOf<PlayerEngine['setMuted']>().parameters.toEqualTypeOf<[boolean]>()
  expectTypeOf<PlayerEngine['setFullscreen']>().parameters.toEqualTypeOf<[boolean]>()
  expectTypeOf<PlayerEngine['selectAudioTrack']>().parameters.toEqualTypeOf<[string]>()
  expectTypeOf<PlayerEngine['selectSubtitleTrack']>()
    .parameters.toEqualTypeOf<[string | null]>()
  expectTypeOf<PlayerEngine['seekToChapter']>().parameters.toEqualTypeOf<[number]>()
  expectTypeOf<PlayerEngine['getControlState']>()
    .returns.toEqualTypeOf<Promise<PlayerControlState>>()
  expectTypeOf<PlayerEngine['getMediaInfo']>()
    .returns.toEqualTypeOf<Promise<PlayerMediaInfo>>()
  expectTypeOf<PlayerEngine>().not.toHaveProperty('command')
  expectTypeOf<PlayerEngine>().not.toHaveProperty('setProperty')
  expectTypeOf<AudioTrack['id']>().toEqualTypeOf<string>()
  expectTypeOf<SubtitleTrack['title']>().toEqualTypeOf<string | null>()
  expectTypeOf<Chapter['startSeconds']>().toEqualTypeOf<number>()
})
```

```ts
// addition to packages/core/src/playback/progress-reporter.test.ts
it('ignores control and media events without producing progress reports', async () => {
  const harness = createReporterHarness()
  harness.reporter.start(plan, harness.send)
  await harness.reporter.handle({
    type: 'started',
    positionSeconds: 0,
    durationSeconds: 120,
  })
  await harness.reporter.whenIdle()
  await harness.reporter.handle({
    type: 'control-state-changed',
    state: { volume: 35, muted: false, fullscreen: true },
  })
  await harness.reporter.handle({ type: 'media-info-changed' })
  await harness.reporter.handle({
    type: 'control-failed',
    action: 'select-audio-track',
    code: 'InvalidTrack',
    message: 'track no longer exists',
  })
  await harness.reporter.whenIdle()
  expect(harness.types()).toEqual(['started'])
})
```

- [ ] **Step 2: Run the tests to verify the red state**

Run:

```bash
pnpm vitest run packages/player/src/player-engine.test.ts packages/core/src/playback/progress-reporter.test.ts
```

Expected: FAIL with missing `PlayerControlState`, `PlayerMediaInfo`, named `PlayerEngine` methods, and timeline-event narrowing.

- [ ] **Step 3: Implement the domain types, exports, and timeline guard**

```ts
// packages/core/src/playback/progress-reporter.ts
type PlaybackTimelineEvent = Extract<
  PlayerEvent,
  {
    type:
      | 'started'
      | 'position'
      | 'paused'
      | 'resumed'
      | 'seeked'
      | 'ended'
      | 'stopped'
  }
>

function isPlaybackTimelineEvent(event: PlayerEvent): event is PlaybackTimelineEvent {
  return (
    event.type === 'started'
    || event.type === 'position'
    || event.type === 'paused'
    || event.type === 'resumed'
    || event.type === 'seeked'
    || event.type === 'ended'
    || event.type === 'stopped'
  )
}

handle(event: PlayerEvent): Promise<void> {
  if (!this.plan || this.stopped || !isPlaybackTimelineEvent(event)) {
    return Promise.resolve()
  }
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
```

Implement `types.ts`, `player-engine.ts`, and `index.ts` exactly as Stable Interfaces. Keep arrays mutable in the public snapshot types because the Tauri payload is newly allocated; stores may expose them read-only.

- [ ] **Step 4: Verify the contract and unchanged v0.1 reporter behavior**

Run:

```bash
pnpm vitest run packages/player packages/core/src/playback/progress-reporter.test.ts
pnpm typecheck
```

Expected: all scoped tests pass; existing started/10-second/pause/seek/stopped tests remain green; typecheck reports zero errors.

- [ ] **Step 5: Commit the stable player contract**

```bash
git add packages/player/src packages/core/src/playback/progress-reporter.ts packages/core/src/playback/progress-reporter.test.ts
git commit -m "feat: define player basics domain contract"
```

## Task 2: 固定 Rust 协议、允许列表与媒体归一化

**可独立验收：** Rust 只构造本计划具名 mpv 属性命令；原始轨道/章节缺失和异常字段被标准化为与 TypeScript 完全一致的结构；非法值在写入 IPC 前被拒绝。

**Files:**
- Modify: `apps/desktop/src-tauri/src/error.rs`
- Modify: `apps/desktop/src-tauri/src/mpv/protocol.rs`
- Create: `apps/desktop/src-tauri/src/mpv/media_info.rs`
- Modify: `apps/desktop/src-tauri/src/mpv/mod.rs`

**Interfaces:**
- Consumes: Rust Stable Interfaces, existing `MpvCommand`, `NativePlayerEvent`, `NativePlaybackPlan`.
- Produces: `ControlAction` named variants; `normalize_media_info(track_list, chapter_list, aid, sid, chapter)`; `NativeError::PlaybackFailed`.

- [ ] **Step 1: Write failing allowlist, validation, event, and normalization tests**

```rust
// additions to apps/desktop/src-tauri/src/mpv/protocol.rs tests
#[test]
fn builds_only_named_player_basic_controls() {
    assert_eq!(
        command_json(control_command(20, ControlAction::SetVolume(42.5))),
        json!(["set_property", "volume", 42.5]),
    );
    assert_eq!(
        command_json(control_command(21, ControlAction::SetMuted(true))),
        json!(["set_property", "mute", true]),
    );
    assert_eq!(
        command_json(control_command(22, ControlAction::SetFullscreen(true))),
        json!(["set_property", "fullscreen", true]),
    );
    assert_eq!(
        command_json(control_command(23, ControlAction::SelectAudioTrack("2".into()))),
        json!(["set_property", "aid", "2"]),
    );
    assert_eq!(
        command_json(control_command(24, ControlAction::SelectSubtitleTrack(None))),
        json!(["set_property", "sid", "no"]),
    );
    assert_eq!(
        command_json(control_command(25, ControlAction::SeekToChapter(1))),
        json!(["set_property", "chapter", 1]),
    );
}

#[test]
fn rejects_generic_or_unapproved_properties() {
    let command = MpvCommand::set_property(99, "video-zoom", 2);
    assert!(command.validate_allowlisted().is_err());
    let arbitrary = MpvCommand::new(100, vec!["script-message".into(), "x".into()]);
    assert!(arbitrary.validate_allowlisted().is_err());
}

#[test]
fn decodes_control_and_media_property_changes_without_raw_arrays_in_events() {
    let update = decode_mpv_message(
        r#"{"event":"property-change","name":"volume","data":37.5}"#,
    ).unwrap();
    assert_eq!(update, ProtocolUpdate::Control(ControlPatch::Volume(37.5)));
    let update = decode_mpv_message(
        r#"{"event":"property-change","name":"track-list","data":[]}"#,
    ).unwrap();
    assert!(matches!(update, ProtocolUpdate::Media(MediaPatch::TrackList(_))));
}
```

```rust
// apps/desktop/src-tauri/src/mpv/media_info.rs tests
#[test]
fn normalizes_missing_track_fields_and_selection() {
    let tracks = json!([
        {"id": 1, "type": "audio", "lang": "eng", "default": true},
        {"id": 2, "type": "audio", "title": "Commentary", "codec": "aac"},
        {"id": 3, "type": "sub", "external": true, "forced": true},
        {"type": "audio", "title": "missing id"}
    ]);
    let info = normalize_media_info(&tracks, &Value::Null, &json!(2), &json!("no"), &json!(-1));
    assert_eq!(info.audio_tracks.len(), 2);
    assert_eq!(info.audio_tracks[0].title, None);
    assert!(!info.audio_tracks[0].selected);
    assert!(info.audio_tracks[1].selected);
    assert_eq!(info.subtitle_tracks[0].language, None);
    assert!(info.subtitle_tracks[0].is_external);
    assert!(info.subtitle_tracks[0].is_forced);
    assert!(!info.subtitle_tracks[0].selected);
    assert!(info.chapters.is_empty());
}

#[test]
fn sorts_chapters_and_marks_the_mpv_index() {
    let chapters = json!([
        {"title": "Second", "time": 60.0},
        {"time": 0.0},
        {"title": "invalid", "time": -1.0}
    ]);
    let info = normalize_media_info(&json!([]), &chapters, &Value::Null, &Value::Null, &json!(1));
    assert_eq!(
        info.chapters.iter().map(|chapter| chapter.start_seconds).collect::<Vec<_>>(),
        vec![0.0, 60.0],
    );
    assert!(info.chapters[0].selected);
}
```

- [ ] **Step 2: Run Rust protocol tests to verify the red state**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mpv::protocol
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mpv::media_info
```

Expected: FAIL because named actions, protocol patches, media normalization, and `PlaybackFailed` native error are absent.

- [ ] **Step 3: Implement exact command validation and parameter guards**

```rust
// apps/desktop/src-tauri/src/mpv/protocol.rs
#[derive(Debug, Clone, PartialEq)]
pub enum ControlAction {
    Pause,
    Resume,
    Seek(f64),
    Stop,
    SetVolume(f64),
    SetMuted(bool),
    SetFullscreen(bool),
    SelectAudioTrack(String),
    SelectSubtitleTrack(Option<String>),
    SeekToChapter(usize),
}

pub fn validate_volume(volume: f64) -> Result<f64, NativeError> {
    if volume.is_finite() && (0.0..=100.0).contains(&volume) {
        Ok(volume)
    } else {
        Err(NativeError::invalid_input("volume must be a finite number from 0 to 100"))
    }
}

pub fn validate_track_id(track_id: &str) -> Result<String, NativeError> {
    let normalized = track_id.trim();
    if normalized.is_empty() {
        Err(NativeError::invalid_input("track id must not be empty"))
    } else {
        Ok(normalized.to_owned())
    }
}

pub fn control_command(request_id: u64, action: ControlAction) -> MpvCommand {
    match action {
        ControlAction::Pause => MpvCommand::set_property(request_id, "pause", true),
        ControlAction::Resume => MpvCommand::set_property(request_id, "pause", false),
        ControlAction::Seek(seconds) => MpvCommand::new(
            request_id,
            vec!["seek".into(), seconds.into(), "absolute".into()],
        ),
        ControlAction::Stop => MpvCommand::simple(request_id, "stop"),
        ControlAction::SetVolume(value) =>
            MpvCommand::set_property(request_id, "volume", value),
        ControlAction::SetMuted(value) =>
            MpvCommand::set_property(request_id, "mute", value),
        ControlAction::SetFullscreen(value) =>
            MpvCommand::set_property(request_id, "fullscreen", value),
        ControlAction::SelectAudioTrack(id) =>
            MpvCommand::set_property(request_id, "aid", id),
        ControlAction::SelectSubtitleTrack(id) =>
            MpvCommand::set_property(request_id, "sid", id.unwrap_or_else(|| "no".into())),
        ControlAction::SeekToChapter(index) =>
            MpvCommand::set_property(request_id, "chapter", index as u64),
    }
}
```

`validate_allowlisted()` must accept `set_property` only for:

```rust
const WRITABLE_PROPERTIES: &[&str] = &[
    "http-header-fields",
    "pause",
    "volume",
    "mute",
    "fullscreen",
    "aid",
    "sid",
    "chapter",
];
```

`observe_property` must accept only:

```rust
const OBSERVABLE_PROPERTIES: &[&str] = &[
    "time-pos",
    "duration",
    "pause",
    "path",
    "idle-active",
    "volume",
    "mute",
    "fullscreen",
    "track-list",
    "chapter-list",
    "aid",
    "sid",
    "chapter",
];
```

- [ ] **Step 4: Implement deterministic media normalization**

```rust
// key normalization in apps/desktop/src-tauri/src/mpv/media_info.rs
fn optional_text(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

fn normalized_id(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(value)) if !value.trim().is_empty() => {
            Some(value.trim().to_owned())
        }
        Some(Value::Number(value)) => Some(value.to_string()),
        _ => None,
    }
}

fn selected_id(value: &Value) -> Option<String> {
    match value {
        Value::String(value) if value != "no" && !value.trim().is_empty() => {
            Some(value.trim().to_owned())
        }
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}
```

`normalize_media_info` must:

1. Ignore entries without a usable `id`, unsupported `type`, negative/non-finite chapter `time`, and non-object entries.
2. Map `lang` to `language`, missing text to `None`, and missing booleans to `false`.
3. Determine selected audio/subtitle from normalized `aid`/`sid`, not from a UI assumption.
4. Preserve mpv’s original chapter index for `seekToChapter(index)`, sort output by `start_seconds`, and mark selection by original mpv chapter index.
5. Return new vectors, never expose raw `serde_json::Value` outside the native module.

- [ ] **Step 5: Add stable native error serialization**

```rust
// additions to apps/desktop/src-tauri/src/error.rs
#[derive(Debug, thiserror::Error)]
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
```

Extend `code()` and `message()` so `PlaybackFailed` serializes as `{ "code": "PlaybackFailed", "message": "<sanitized>" }`. Add it to existing redaction tests and assert URL/header/track subtitle text is absent from serialized failures.

- [ ] **Step 6: Verify protocol, normalization, and v0.1 security tests**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mpv::protocol
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mpv::media_info
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml error
```

Expected: named command JSON matches exactly; arbitrary commands/properties fail; missing fields normalize without panic; native errors contain only code and sanitized message.

- [ ] **Step 7: Commit the restricted native protocol**

```bash
git add apps/desktop/src-tauri/src/error.rs apps/desktop/src-tauri/src/mpv/protocol.rs apps/desktop/src-tauri/src/mpv/media_info.rs apps/desktop/src-tauri/src/mpv/mod.rs
git commit -m "feat: restrict and normalize mpv basic controls"
```

## Task 3: 建立可确认失败的 MpvSession 与具名 Tauri 命令

**可独立验收：** 每个控制命令等待对应 mpv `request_id` 成功/失败响应；属性事件更新线程安全快照；无会话、IPC 关闭、mpv 失败和非法参数返回稳定错误，且不伪造成功状态。

**Files:**
- Modify: `apps/desktop/src-tauri/src/mpv/session.rs`
- Modify: `apps/desktop/src-tauri/src/commands/player.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/mpv/protocol.rs`

**Interfaces:**
- Consumes: Task 2 `ControlAction`, `ProtocolUpdate`, native snapshots/events.
- Produces: all eight new Tauri commands in Stable Interfaces; `MpvSession` named methods and snapshots.

- [ ] **Step 1: Write failing session response-routing and snapshot tests**

```rust
// unit tests colocated in apps/desktop/src-tauri/src/mpv/session.rs
#[tokio::test]
async fn command_waits_for_matching_mpv_response() {
    let mut harness = SessionIoHarness::new().await;
    let pending = harness.session.set_volume(25.0);
    let request = harness.next_request().await;
    assert_eq!(request.command, json!(["set_property", "volume", 25.0]));
    harness.reply(request.request_id, "success").await;
    pending.await.expect("acknowledged volume command");
}

#[tokio::test]
async fn command_error_is_returned_without_changing_snapshot() {
    let mut harness = SessionIoHarness::new().await;
    harness.emit_property("volume", json!(70.0)).await;
    let before = harness.session.control_state().await;
    let pending = harness.session.set_volume(20.0);
    let request = harness.next_request().await;
    harness.reply(request.request_id, "invalid parameter").await;
    assert_eq!(pending.await.unwrap_err().code(), "PlaybackFailed");
    assert_eq!(harness.session.control_state().await, before);
}

#[tokio::test]
async fn consecutive_media_changes_emit_notifications_but_snapshots_hold_arrays() {
    let mut harness = SessionIoHarness::new().await;
    harness.emit_property("track-list", dual_track_list()).await;
    harness.emit_property("aid", json!(2)).await;
    assert!(matches!(
        harness.session.next_event().await,
        Some(NativePlayerEvent::MediaInfoChanged),
    ));
    let info = harness.session.media_info().await;
    assert_eq!(info.audio_tracks.len(), 2);
    assert!(info.audio_tracks[1].selected);
}
```

- [ ] **Step 2: Run session tests to verify the red state**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mpv::session
```

Expected: FAIL because request correlation, snapshots, named session methods, and acknowledged failures are absent.

- [ ] **Step 3: Refactor the IPC reader into response and event routes**

```rust
// core private state in apps/desktop/src-tauri/src/mpv/session.rs
type PendingResponses = std::sync::Arc<
    tokio::sync::Mutex<
        std::collections::HashMap<u64, tokio::sync::oneshot::Sender<Result<(), String>>>
    >
>;

#[derive(Default)]
struct PlayerSnapshots {
    control: NativePlayerControlState,
    track_list: serde_json::Value,
    chapter_list: serde_json::Value,
    aid: serde_json::Value,
    sid: serde_json::Value,
    chapter: serde_json::Value,
}

async fn send_checked(
    writer: &mut IpcWriter,
    pending: &PendingResponses,
    command: &MpvCommand,
) -> Result<(), NativeError> {
    command.validate_allowlisted().map_err(NativeError::invalid_input)?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    pending.lock().await.insert(command.request_id(), tx);
    if let Err(error) = writer.send_line(&command.as_json_line().map_err(
        |error| NativeError::playback_failed(error.to_string()),
    )?).await {
        pending.lock().await.remove(&command.request_id());
        return Err(NativeError::playback_failed(error.message().to_owned()));
    }
    match tokio::time::timeout(std::time::Duration::from_secs(3), rx).await {
        Ok(Ok(Ok(()))) => Ok(()),
        Ok(Ok(Err(message))) => Err(NativeError::playback_failed(message)),
        Ok(Err(_)) => Err(NativeError::playback_failed("mpv response channel closed")),
        Err(_) => Err(NativeError::playback_failed("timed out waiting for mpv response")),
    }
}
```

Move the event reader startup before sending observation commands. `read_events` must route:

- response with `request_id` to `PendingResponses`;
- control patches into `PlayerSnapshots.control`, followed by `control-state-changed`;
- media patches into raw private snapshot fields, followed by `media-info-changed`;
- v0.1 timeline/end/error events through the existing event channel.

On EOF, fail every pending response with `"mpv IPC disconnected"` and emit one `NativePlayerEvent::Error { code: "PlaybackFailed", ... }`. Never include the raw line in the error.

- [ ] **Step 4: Implement named MpvSession methods and immutable snapshots**

```rust
impl MpvSession {
    pub async fn set_volume(&mut self, volume: f64) -> Result<(), NativeError> {
        let value = validate_volume(volume)?;
        self.send_control(ControlAction::SetVolume(value)).await
    }

    pub async fn select_audio_track(&mut self, track_id: String) -> Result<(), NativeError> {
        let id = validate_track_id(&track_id)?;
        self.send_control(ControlAction::SelectAudioTrack(id)).await
    }

    pub async fn select_subtitle_track(
        &mut self,
        track_id: Option<String>,
    ) -> Result<(), NativeError> {
        let id = track_id.map(|value| validate_track_id(&value)).transpose()?;
        self.send_control(ControlAction::SelectSubtitleTrack(id)).await
    }

    pub async fn seek_to_chapter(&mut self, chapter_index: usize) -> Result<(), NativeError> {
        self.send_control(ControlAction::SeekToChapter(chapter_index)).await
    }

    pub async fn control_state(&self) -> NativePlayerControlState {
        self.snapshots.read().await.control.clone()
    }

    pub async fn media_info(&self) -> NativePlayerMediaInfo {
        let snapshot = self.snapshots.read().await;
        normalize_media_info(
            &snapshot.track_list,
            &snapshot.chapter_list,
            &snapshot.aid,
            &snapshot.sid,
            &snapshot.chapter,
        )
    }
}
```

Implement `set_muted` and `set_fullscreen` with the same `send_control` path. Keep seek validation for finite non-negative seconds. Snapshot getters clone normalized values and never return references to mutable native state.

- [ ] **Step 5: Write failing command-channel tests**

```rust
// additions to apps/desktop/src-tauri/src/commands/player.rs tests
#[tokio::test]
async fn rejects_invalid_values_before_enqueueing() {
    assert!(validate_set_volume(f64::NAN).is_err());
    assert!(validate_set_volume(-0.1).is_err());
    assert!(validate_set_volume(100.1).is_err());
    assert!(validate_track_input("   ").is_err());
    assert!(validate_chapter_index(-1).is_err());
}

#[tokio::test]
async fn no_session_returns_player_unavailable() {
    let state = test_player_state_without_session();
    let error = request_control(&state, PlayerControlRequest::GetControlState)
        .await
        .unwrap_err();
    assert_eq!(error.code(), "PlayerUnavailable");
}
```

- [ ] **Step 6: Implement request/reply `PlayerControl` and Tauri commands**

```rust
// apps/desktop/src-tauri/src/commands/player.rs
enum PlayerControlRequest {
    Pause,
    Resume,
    Seek(f64),
    Stop,
    SetVolume(f64),
    SetMuted(bool),
    SetFullscreen(bool),
    SelectAudioTrack(String),
    SelectSubtitleTrack(Option<String>),
    SeekToChapter(usize),
    GetControlState,
    GetMediaInfo,
}

enum PlayerControlResult {
    Unit,
    ControlState(NativePlayerControlState),
    MediaInfo(NativePlayerMediaInfo),
}

struct PlayerControl {
    request: PlayerControlRequest,
    reply: tokio::sync::oneshot::Sender<Result<PlayerControlResult, NativeError>>,
}
```

The pump must call the matching `MpvSession` named method and send the exact result through `reply`; never discard `Result`. Each Tauri command validates its input, calls the shared request/reply helper, and pattern-matches the expected output.

```rust
#[tauri::command]
pub async fn player_set_volume(
    state: State<'_, Arc<PlayerState>>,
    volume: f64,
) -> Result<(), NativeError> {
    let volume = validate_volume(volume)?;
    request_unit(&state, PlayerControlRequest::SetVolume(volume)).await
}

#[tauri::command]
pub async fn player_get_media_info(
    state: State<'_, Arc<PlayerState>>,
) -> Result<NativePlayerMediaInfo, NativeError> {
    match request_control(&state, PlayerControlRequest::GetMediaInfo).await? {
        PlayerControlResult::MediaInfo(info) => Ok(info),
        _ => Err(NativeError::playback_failed("unexpected player response type")),
    }
}
```

Register exactly the eight new commands in `apps/desktop/src-tauri/src/lib.rs`. Do not change `capabilities/default.json`: application-owned invoke commands do not require adding shell or filesystem permissions.

- [ ] **Step 7: Verify command failures, disconnects, and registration**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mpv::session
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands::player
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml capabilities
```

Expected: acknowledged commands pass; mpv failure and IPC closure return `PlaybackFailed`; no-session returns `PlayerUnavailable`; capability tests show no shell/general IPC permission.

- [ ] **Step 8: Commit the acknowledged native control path**

```bash
git add apps/desktop/src-tauri/src/mpv/session.rs apps/desktop/src-tauri/src/mpv/protocol.rs apps/desktop/src-tauri/src/commands/player.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: acknowledge named native player controls"
```

## Task 4: 扩展 TauriPlayerEngine 与确定性 FakePlayerEngine

**可独立验收：** TypeScript bridge 对参数做第一层校验并只调用具名 Tauri 命令；fake engine 具有相同事件/快照语义，可模拟媒体切换和命令失败。

**Files:**
- Modify: `apps/desktop/src/platform/player/tauri-player-engine.ts`
- Modify: `apps/desktop/src/platform/player/tauri-player-engine.test.ts`
- Modify: `apps/desktop/src/platform/player/fake-player-engine.ts`
- Modify: `apps/desktop/src/composition/create-e2e-services.ts`

**Interfaces:**
- Consumes: Task 1 `PlayerEngine`, control/media types; Task 3 exact Tauri commands.
- Produces: complete `TauriPlayerEngine`; fake-only `replaceMedia(info)` and `failNext(action, error)`.

- [ ] **Step 1: Write failing bridge mapping and validation tests**

```ts
// additions to apps/desktop/src/platform/player/tauri-player-engine.test.ts
it('maps every named control and snapshot command exactly', async () => {
  invoke.mockImplementation(async (command: string) => {
    if (command === 'player_get_control_state') {
      return { volume: 55, muted: false, fullscreen: true }
    }
    if (command === 'player_get_media_info') return mediaInfo
  })
  const engine = new TauriPlayerEngine(invoke as never, listen as never)
  await engine.setVolume(55)
  await engine.setMuted(true)
  await engine.setFullscreen(true)
  await engine.selectAudioTrack('2')
  await engine.selectSubtitleTrack(null)
  await engine.seekToChapter(1)
  expect(invoke.mock.calls).toEqual([
    ['player_set_volume', { volume: 55 }],
    ['player_set_muted', { muted: true }],
    ['player_set_fullscreen', { fullscreen: true }],
    ['player_select_audio_track', { trackId: '2' }],
    ['player_select_subtitle_track', { trackId: null }],
    ['player_seek_to_chapter', { chapterIndex: 1 }],
  ])
  await expect(engine.getControlState()).resolves.toEqual({
    volume: 55,
    muted: false,
    fullscreen: true,
  })
  await expect(engine.getMediaInfo()).resolves.toEqual(mediaInfo)
})

it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 101])(
  'rejects invalid volume %s without invoking native code',
  async (volume) => {
    const engine = new TauriPlayerEngine(invoke as never, listen as never)
    await expect(engine.setVolume(volume)).rejects.toThrow(/0 to 100/)
    expect(invoke).not.toHaveBeenCalled()
  },
)

it('rejects invalid track and chapter values before invoke', async () => {
  const engine = new TauriPlayerEngine(invoke as never, listen as never)
  await expect(engine.selectAudioTrack('  ')).rejects.toThrow(/track id/)
  await expect(engine.selectSubtitleTrack('')).rejects.toThrow(/track id/)
  await expect(engine.seekToChapter(-1)).rejects.toThrow(/chapter index/)
  await expect(engine.seekToChapter(1.5)).rejects.toThrow(/chapter index/)
  expect(invoke).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run bridge tests to verify the red state**

Run:

```bash
pnpm vitest run apps/desktop/src/platform/player/tauri-player-engine.test.ts
```

Expected: FAIL because the named methods and validation do not exist.

- [ ] **Step 3: Implement the exact TypeScript bridge**

```ts
setVolume(volume: number): Promise<void> {
  if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
    return Promise.reject(new RangeError('volume must be a finite number from 0 to 100'))
  }
  return this.invokeFn('player_set_volume', { volume })
}

selectAudioTrack(trackId: string): Promise<void> {
  const normalized = trackId.trim()
  if (!normalized) return Promise.reject(new TypeError('track id must not be empty'))
  return this.invokeFn('player_select_audio_track', { trackId: normalized })
}

selectSubtitleTrack(trackId: string | null): Promise<void> {
  if (trackId === null) {
    return this.invokeFn('player_select_subtitle_track', { trackId: null })
  }
  const normalized = trackId.trim()
  if (!normalized) return Promise.reject(new TypeError('track id must not be empty'))
  return this.invokeFn('player_select_subtitle_track', { trackId: normalized })
}

seekToChapter(chapterIndex: number): Promise<void> {
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
    return Promise.reject(new RangeError('chapter index must be a non-negative integer'))
  }
  return this.invokeFn('player_seek_to_chapter', { chapterIndex })
}

getControlState(): Promise<PlayerControlState> {
  return this.invokeFn('player_get_control_state')
}

getMediaInfo(): Promise<PlayerMediaInfo> {
  return this.invokeFn('player_get_media_info')
}
```

Implement boolean setters as direct named invokes. Preserve the existing single `player://event` subscription and early-unsubscribe behavior.

- [ ] **Step 4: Write failing fake-engine behavior tests**

```ts
// append a describe block to tauri-player-engine.test.ts or create an adjacent block
it('fake engine changes state only through emitted player truth', async () => {
  const engine = new FakePlayerEngine()
  const events: PlayerEvent[] = []
  engine.subscribe((event) => events.push(event))
  await engine.play(plan)
  await engine.setVolume(30)
  await engine.setMuted(true)
  await engine.setFullscreen(true)
  expect(await engine.getControlState()).toEqual({
    volume: 30,
    muted: true,
    fullscreen: true,
  })
  expect(events.at(-1)).toEqual({
    type: 'control-state-changed',
    state: { volume: 30, muted: true, fullscreen: true },
  })
})

it('fake engine refreshes changed tracks and can reject a stale id', async () => {
  const engine = new FakePlayerEngine()
  await engine.play(plan)
  engine.replaceMedia(mediaInfo)
  await expect(engine.getMediaInfo()).resolves.toEqual(mediaInfo)
  engine.replaceMedia({ ...mediaInfo, audioTracks: [mediaInfo.audioTracks[0]] })
  await expect(engine.selectAudioTrack('2')).rejects.toMatchObject({
    code: 'InvalidTrack',
  })
})
```

- [ ] **Step 5: Implement fake snapshots, explicit selection, and failure injection**

`FakePlayerEngine` defaults:

```ts
private controlState: PlayerControlState = {
  volume: 100,
  muted: false,
  fullscreen: false,
}
private mediaInfo: PlayerMediaInfo = {
  audioTracks: [],
  subtitleTracks: [],
  chapters: [],
}
private nextFailure = new Map<PlayerControlAction, unknown>()
```

Every successful setter updates a cloned snapshot and emits the matching stable event. Track selection maps arrays so exactly the requested track is selected; subtitle `null` clears all subtitle selections; chapter selection uses the stable `Chapter.index`. Missing IDs reject with `{ code: 'InvalidTrack', message: 'track no longer exists' }` and leave snapshots unchanged.

`replaceMedia(info)` clones its arrays and emits one `media-info-changed`. `failNext(action, error)` is compile-time E2E support only and is exposed through `create-e2e-services.ts`; production composition remains `TauriPlayerEngine`.

- [ ] **Step 6: Verify bridge and fake parity**

Run:

```bash
pnpm vitest run apps/desktop/src/platform/player/tauri-player-engine.test.ts
pnpm typecheck
pnpm check:boundaries
```

Expected: all named invokes and validations pass; fake behavior matches domain snapshots; no `packages/player` import points to Vue/Tauri/core; no generic command method exists.

- [ ] **Step 7: Commit TypeScript player adapters**

```bash
git add apps/desktop/src/platform/player/tauri-player-engine.ts apps/desktop/src/platform/player/tauri-player-engine.test.ts apps/desktop/src/platform/player/fake-player-engine.ts apps/desktop/src/composition/create-e2e-services.ts
git commit -m "feat: bridge named player controls to desktop"
```

## Task 5: 用事件和合并快照驱动 player-store

**可独立验收：** store 初始化一次快照，之后只消费事件；连续媒体通知在同一批次合并；失败不伪造成功状态；无会话不调用 engine；控制事件不进入进度上报。

**Files:**
- Modify: `apps/desktop/src/stores/player-store.ts`
- Modify: `apps/desktop/src/stores/player-store.test.ts`

**Interfaces:**
- Consumes: complete `PlayerEngine`, `ProgressReporter`.
- Produces: store state `controlState`, `mediaInfo`, `hasActiveSession`, `controlError`; named store actions.

- [ ] **Step 1: Extend the store harness and write failing state/coalescing tests**

```ts
// additions to createPlayerStoreHarness() in player-store.test.ts
const controlState: PlayerControlState = {
  volume: 80,
  muted: false,
  fullscreen: false,
}
const mediaInfo: PlayerMediaInfo = {
  audioTracks: [
    {
      id: '1', title: null, language: 'jpn', codec: 'aac',
      selected: true, isDefault: true, isForced: false, isExternal: false,
    },
    {
      id: '2', title: 'Commentary', language: 'eng', codec: 'aac',
      selected: false, isDefault: false, isForced: false, isExternal: false,
    },
  ],
  subtitleTracks: [],
  chapters: [
    { index: 0, title: null, startSeconds: 0, selected: true },
    { index: 1, title: 'Part 2', startSeconds: 60, selected: false },
  ],
}
engine.getControlState = vi.fn().mockResolvedValue(controlState)
engine.getMediaInfo = vi.fn().mockResolvedValue(mediaInfo)
```

```ts
it('loads one initial snapshot and then follows control events', async () => {
  const harness = createPlayerStoreHarness()
  await harness.withStore(async (store) => {
    await store.initializePlayerState()
    expect(harness.engine.getControlState).toHaveBeenCalledTimes(1)
    expect(harness.engine.getMediaInfo).toHaveBeenCalledTimes(1)
    harness.emitPlayer({
      type: 'control-state-changed',
      state: { volume: 25, muted: true, fullscreen: true },
    })
    expect(store.controlState).toEqual({
      volume: 25,
      muted: true,
      fullscreen: true,
    })
  })
})

it('coalesces consecutive media notifications into one refresh', async () => {
  const harness = createPlayerStoreHarness()
  await harness.withStore(async (store) => {
    await store.initializePlayerState()
    harness.engine.getMediaInfo.mockClear()
    harness.emitPlayer({ type: 'media-info-changed' })
    harness.emitPlayer({ type: 'media-info-changed' })
    harness.emitPlayer({ type: 'media-info-changed' })
    await store.whenMediaInfoIdle()
    expect(harness.engine.getMediaInfo).toHaveBeenCalledTimes(1)
  })
})

it('does not send controls without an active session', async () => {
  const harness = createPlayerStoreHarness()
  await harness.withStore(async (store) => {
    await expect(store.setVolume(10)).rejects.toMatchObject({
      code: 'PlayerUnavailable',
    })
    expect(harness.engine.setVolume).not.toHaveBeenCalled()
  })
})

it('keeps player state authoritative when a command rejects', async () => {
  const harness = createPlayerStoreHarness()
  harness.engine.setFullscreen.mockRejectedValueOnce({
    code: 'PlaybackFailed',
    message: 'mpv IPC disconnected',
  })
  await harness.withStore(async (store) => {
    await store.play('profile-1', 'item-1')
    harness.emitPlayer({ type: 'started', positionSeconds: 0, durationSeconds: 120 })
    expect(store.controlState.fullscreen).toBe(false)
    await expect(store.setFullscreen(true)).rejects.toBeTruthy()
    expect(store.controlState.fullscreen).toBe(false)
    expect(store.controlError).toContain('mpv IPC disconnected')
  })
})
```

- [ ] **Step 2: Run store tests to verify the red state**

Run:

```bash
pnpm vitest run apps/desktop/src/stores/player-store.test.ts
```

Expected: FAIL because snapshot state, initialization, coalescing, guards, and named actions are absent.

- [ ] **Step 3: Implement explicit state, session guard, and non-optimistic actions**

```ts
const controlState = ref<PlayerControlState>({
  volume: 100,
  muted: false,
  fullscreen: false,
})
const mediaInfo = ref<PlayerMediaInfo>({
  audioTracks: [],
  subtitleTracks: [],
  chapters: [],
})
const controlError = ref<string | null>(null)
const hasActiveSession = computed(
  () => state.value === 'loading' || state.value === 'playing' || state.value === 'paused',
)

function requireActiveSession(): void {
  if (!hasActiveSession.value) {
    throw {
      code: 'PlayerUnavailable',
      message: '请先开始播放。',
    }
  }
}

async function runControl(operation: () => Promise<void>): Promise<void> {
  requireActiveSession()
  controlError.value = null
  try {
    await operation()
  } catch (error) {
    controlError.value = playbackErrorMessage(error)
    throw error
  }
}

const setVolume = (volume: number) =>
  runControl(() => services.player.setVolume(volume))
const setMuted = (muted: boolean) =>
  runControl(() => services.player.setMuted(muted))
const setFullscreen = (fullscreen: boolean) =>
  runControl(() => services.player.setFullscreen(fullscreen))
```

Implement track/subtitle/chapter actions through `runControl`. Do not assign requested values to `controlState` or `mediaInfo`; wait for engine events/snapshots.

- [ ] **Step 4: Implement initial snapshots and lossless notification coalescing**

```ts
let mediaRefreshRequested = false
let mediaRefreshPromise: Promise<void> = Promise.resolve()

async function initializePlayerState(): Promise<void> {
  const [controls, info] = await Promise.all([
    services.player.getControlState(),
    services.player.getMediaInfo(),
  ])
  controlState.value = controls
  mediaInfo.value = info
}

function scheduleMediaInfoRefresh(): void {
  mediaRefreshRequested = true
  mediaRefreshPromise = mediaRefreshPromise.then(async () => {
    await Promise.resolve()
    while (mediaRefreshRequested) {
      mediaRefreshRequested = false
      try {
        mediaInfo.value = await services.player.getMediaInfo()
      } catch (error) {
        controlError.value = playbackErrorMessage(error)
      }
    }
  })
}

function whenMediaInfoIdle(): Promise<void> {
  return mediaRefreshPromise
}
```

In the subscription:

- assign `control-state-changed.state`;
- call `scheduleMediaInfoRefresh()` for `media-info-changed`;
- for `control-failed` with `InvalidTrack`, set localized guidance and schedule refresh;
- send every event to `reporter.handle(event)`, relying on Task 1’s explicit timeline guard;
- clear `activePlan`, active IDs, control/media snapshots, and errors on `ended`/`stopped`;
- preserve last timeline position on `error`.

Call `initializePlayerState()` once after subscription is established. Tests call it explicitly; production may fire-and-forget once and surface failure as a disabled/no-session state.

- [ ] **Step 5: Add no-polling and progress-isolation assertions**

```ts
it('uses no interval polling and sends no reports for control events', async () => {
  const interval = vi.spyOn(globalThis, 'setInterval')
  const harness = createPlayerStoreHarness()
  await harness.withStore(async (store) => {
    await store.play('profile-1', 'item-1')
    harness.emitPlayer({
      type: 'control-state-changed',
      state: { volume: 10, muted: false, fullscreen: false },
    })
    harness.emitPlayer({ type: 'media-info-changed' })
    await store.whenMediaInfoIdle()
    await harness.progressReporter.whenIdle()
    expect(interval).not.toHaveBeenCalled()
    expect(harness.reportPlayback).not.toHaveBeenCalledWith(
      'profile-1',
      expect.objectContaining({ type: 'progress' }),
    )
  })
})
```

- [ ] **Step 6: Verify store behavior and progress regression**

Run:

```bash
pnpm vitest run apps/desktop/src/stores/player-store.test.ts packages/core/src/playback/progress-reporter.test.ts
pnpm typecheck
```

Expected: initial getters run once; burst notifications produce one refresh per settled batch; command failure leaves prior state intact; no interval exists; progress tests remain green.

- [ ] **Step 7: Commit event-driven player state**

```bash
git add apps/desktop/src/stores/player-store.ts apps/desktop/src/stores/player-store.test.ts
git commit -m "feat: synchronize player controls from events"
```

## Task 6: 构建可访问的播放器基础控件

**可独立验收：** 主控制条提供音量、静音、全屏、音轨、字幕和章节操作；无会话禁用；回退文案、标记、空状态和选择状态完全来自 store 快照。

**Files:**
- Modify: `apps/desktop/src/components/PlayerControls.vue`
- Create: `apps/desktop/src/components/PlayerControls.test.ts`
- Modify: `apps/desktop/src/views/MediaDetailView.test.ts`

**Interfaces:**
- Consumes: Task 5 player store fields/actions.
- Produces: deterministic test IDs and Chinese UI copy below.

- [ ] **Step 1: Write failing disabled and main-control tests**

```ts
// apps/desktop/src/components/PlayerControls.test.ts
it('renders disabled controls without sending commands when idle', async () => {
  const { wrapper, player } = mountControls({ state: 'idle' })
  expect(wrapper.get('[data-testid="player-volume"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="player-mute"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="player-fullscreen"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="player-mute"]').trigger('click')
  expect(player.setMuted).not.toHaveBeenCalled()
})

it('sends volume mute and fullscreen requests without optimistic labels', async () => {
  const { wrapper, player } = mountControls({
    state: 'playing',
    controlState: { volume: 80, muted: false, fullscreen: false },
  })
  await wrapper.get('[data-testid="player-volume"]').setValue(35)
  await wrapper.get('[data-testid="player-mute"]').trigger('click')
  await wrapper.get('[data-testid="player-fullscreen"]').trigger('click')
  expect(player.setVolume).toHaveBeenCalledWith(35)
  expect(player.setMuted).toHaveBeenCalledWith(true)
  expect(player.setFullscreen).toHaveBeenCalledWith(true)
  expect(wrapper.get('[data-testid="player-mute"]').text()).toContain('静音')
  expect(wrapper.get('[data-testid="player-fullscreen"]').text()).toContain('进入全屏')
})
```

- [ ] **Step 2: Write failing track, subtitle, chapter, and fallback tests**

```ts
it('renders deterministic labels and explicit selections', async () => {
  const { wrapper, player } = mountControls({
    state: 'playing',
    mediaInfo,
  })
  expect(wrapper.get('[data-testid="audio-track-1"]').text())
    .toContain('音轨 1 · jpn · aac')
  expect(wrapper.get('[data-testid="audio-track-1"]').text()).toContain('默认')
  expect(wrapper.get('[data-testid="subtitle-off"]').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('[data-testid="subtitle-track-3"]').text()).toContain('外挂')
  expect(wrapper.get('[data-testid="chapter-0"]').text()).toContain('章节 1 · 00:00')
  expect(wrapper.get('[data-testid="chapter-1"]').text()).toContain('Part 2 · 01:00')

  await wrapper.get('[data-testid="audio-track-2"]').trigger('click')
  await wrapper.get('[data-testid="subtitle-off"]').trigger('click')
  await wrapper.get('[data-testid="chapter-1"]').trigger('click')
  expect(player.selectAudioTrack).toHaveBeenCalledWith('2')
  expect(player.selectSubtitleTrack).toHaveBeenCalledWith(null)
  expect(player.seekToChapter).toHaveBeenCalledWith(1)
})

it('shows empty states without treating them as playback errors', () => {
  const { wrapper } = mountControls({
    state: 'playing',
    mediaInfo: { audioTracks: [], subtitleTracks: [], chapters: [] },
  })
  expect(wrapper.get('[data-testid="audio-empty"]').text()).toBe('没有可选音轨')
  expect(wrapper.get('[data-testid="subtitle-empty"]').text()).toBe('没有可选字幕')
  expect(wrapper.get('[data-testid="chapter-empty"]').text()).toBe('没有章节')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})
```

- [ ] **Step 3: Run component tests to verify the red state**

Run:

```bash
pnpm vitest run apps/desktop/src/components/PlayerControls.test.ts apps/desktop/src/views/MediaDetailView.test.ts
```

Expected: FAIL because the component lacks new controls, panels, labels, and idle rendering.

- [ ] **Step 4: Implement shared display helpers and guarded handlers**

```ts
function trackLabel(
  track: AudioTrack | SubtitleTrack,
  kind: '音轨' | '字幕',
  ordinal: number,
): string {
  return [track.title ?? `${kind} ${ordinal}`, track.language, track.codec]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

function trackFlags(track: AudioTrack | SubtitleTrack): string[] {
  return [
    track.isDefault ? '默认' : null,
    track.isForced ? '强制' : null,
    track.isExternal ? '外挂' : null,
  ].filter((flag): flag is string => flag !== null)
}

function chapterLabel(chapter: Chapter, ordinal: number): string {
  return `${chapter.title ?? `章节 ${ordinal}`} · ${formatClock(chapter.startSeconds)}`
}

async function onVolume(event: Event): Promise<void> {
  if (!playerStore.hasActiveSession) return
  const value = Number((event.target as HTMLInputElement).value)
  await playerStore.setVolume(value)
}
```

Use the same active-session guard in every handler in addition to native/store validation.

- [ ] **Step 5: Implement semantic controls and panels**

The template must:

- render the control surface even when idle so disabled state is visible;
- keep existing play/pause/seek/stop behavior;
- use range input `min="0"`, `max="100"`, `step="1"`, `:value="controlState.volume"`;
- set `disabled` from `!hasActiveSession`;
- use `aria-pressed` for mute/fullscreen and selected track/chapter buttons;
- include subtitle “关闭” as `data-testid="subtitle-off"`;
- render selected state only from `track.selected` / `chapter.selected`;
- render `controlError` in one `role="alert"` region;
- avoid `v-html`, because subtitle/track titles are untrusted media metadata.

Use these panel labels and empty copy exactly:

```text
音轨 / 没有可选音轨
字幕 / 关闭 / 没有可选字幕
章节 / 没有章节
静音 / 取消静音
进入全屏 / 退出全屏
```

- [ ] **Step 6: Verify detail integration and accessibility semantics**

Run:

```bash
pnpm vitest run apps/desktop/src/components/PlayerControls.test.ts apps/desktop/src/views/MediaDetailView.test.ts
pnpm --filter @lumaroute/desktop typecheck
```

Expected: controls render inside media detail; idle controls are disabled; all explicit actions map once; labels/flags/empty states pass; no raw mpv field appears in component props.

- [ ] **Step 7: Commit the player controls**

```bash
git add apps/desktop/src/components/PlayerControls.vue apps/desktop/src/components/PlayerControls.test.ts apps/desktop/src/views/MediaDetailView.test.ts
git commit -m "feat: add desktop player basic controls"
```

## Task 7: 扩展 fake mpv 与原生集成覆盖

**可独立验收：** fake mpv 接收六类新增控制、发出属性变化、提供双音轨/内嵌与外挂字幕/双章节、切换媒体 ID，并可模拟命令失败和 IPC 断开；Rust 集成测试覆盖完整链路和既有权限清理。

**Files:**
- Modify: `tests/integration/support/fake-mpv.mjs`
- Modify: `apps/desktop/src-tauri/tests/mpv_session.rs`

**Interfaces:**
- Consumes: Task 2/3 native protocol/session.
- Produces: fake mpv environment controls `LUMAROUTE_FAKE_MPV_MODE=normal|changed-media|fail-track|disconnect`.

- [ ] **Step 1: Write failing native integration tests**

```rust
// additions to apps/desktop/src-tauri/tests/mpv_session.rs
#[tokio::test]
async fn controls_volume_mute_fullscreen_tracks_subtitles_and_chapters() {
    let mut harness = TestHarness::start_with_mode("normal").await;
    harness.play(test_plan()).await.expect("play");
    assert!(matches!(harness.next_event().await, NativePlayerEvent::Started { .. }));

    harness.session.set_volume(35.0).await.expect("volume");
    harness.session.set_muted(true).await.expect("mute");
    harness.session.set_fullscreen(true).await.expect("fullscreen");
    harness.session.select_audio_track("2".into()).await.expect("audio");
    harness.session.select_subtitle_track(None).await.expect("subtitle off");
    harness.session.seek_to_chapter(1).await.expect("chapter");

    let controls = harness.session.control_state().await;
    assert_eq!(controls, NativePlayerControlState {
        volume: 35.0,
        muted: true,
        fullscreen: true,
    });
    let info = harness.session.media_info().await;
    assert_eq!(info.audio_tracks.len(), 2);
    assert!(info.audio_tracks.iter().any(|track| track.id == "2" && track.selected));
    assert!(info.subtitle_tracks.iter().all(|track| !track.selected));
    assert!(info.chapters.iter().any(|chapter| chapter.index == 1 && chapter.selected));
    harness.stop().await.expect("stop");
}

#[tokio::test]
async fn refreshes_ids_after_media_change_without_raw_arrays_in_events() {
    let mut harness = TestHarness::start_with_mode("changed-media").await;
    harness.play(test_plan()).await.expect("play");
    harness.wait_for_media_notification().await;
    let first = harness.session.media_info().await;
    harness.trigger_second_load().await;
    harness.wait_for_media_notification().await;
    let second = harness.session.media_info().await;
    assert_ne!(first.audio_tracks[0].id, second.audio_tracks[0].id);
}

#[tokio::test]
async fn propagates_command_failure_and_ipc_disconnect() {
    let mut failed = TestHarness::start_with_mode("fail-track").await;
    failed.play(test_plan()).await.expect("play");
    assert_eq!(
        failed.session.select_audio_track("stale".into()).await.unwrap_err().code(),
        "PlaybackFailed",
    );

    let mut disconnected = TestHarness::start_with_mode("disconnect").await;
    disconnected.play(test_plan()).await.expect("play");
    assert_eq!(
        disconnected.session.set_volume(20.0).await.unwrap_err().code(),
        "PlaybackFailed",
    );
}
```

- [ ] **Step 2: Run integration tests to verify the red state**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test mpv_session
```

Expected: FAIL because fake mpv does not implement new properties, structures, modes, or acknowledged failures.

- [ ] **Step 3: Implement stateful fake mpv properties and observations**

```js
const state = {
  volume: 100,
  mute: false,
  fullscreen: false,
  aid: 1,
  sid: 3,
  chapter: 0,
  trackList: [
    { id: 1, type: 'audio', lang: 'jpn', codec: 'aac', default: true },
    { id: 2, type: 'audio', title: 'Commentary', lang: 'eng', codec: 'aac' },
    { id: 3, type: 'sub', title: 'English', lang: 'eng', codec: 'subrip' },
    { id: 4, type: 'sub', title: 'External', lang: 'zho', codec: 'ass', external: true },
  ],
  chapterList: [
    { title: 'Opening', time: 0 },
    { title: 'Part 2', time: 60 },
  ],
}

function emitProperty(socket, name) {
  const propertyToKey = {
    volume: 'volume',
    mute: 'mute',
    fullscreen: 'fullscreen',
    aid: 'aid',
    sid: 'sid',
    chapter: 'chapter',
    'track-list': 'trackList',
    'chapter-list': 'chapterList',
  }
  socket.write(`${JSON.stringify({
    event: 'property-change',
    name,
    data: state[propertyToKey[name]],
  })}\n`)
}
```

Track observed property names from `observe_property`; immediately emit their current value and emit again after matching `set_property`. For `sid=no`, store `"no"`. For media change mode, replace IDs with `11/12/13/14` and emit `track-list`, `aid`, and `sid`.

Every request receives exactly one response:

```js
function reply(socket, requestId, error = 'success') {
  socket.write(`${JSON.stringify({ request_id: requestId, error })}\n`)
}
```

`fail-track` returns `"invalid parameter"` for `aid=stale`; `disconnect` destroys the socket before replying to the first new control after load. Never echo command arrays or values to stdout/stderr.

- [ ] **Step 4: Preserve security, permission, and cleanup assertions**

Extend the existing test harness without removing:

- unique random endpoint assertion;
- Unix current-user-only socket assertion;
- Windows named-pipe current-user ACL assertion;
- endpoint removal after stop;
- request header absent from URL/command-line/log assertion;
- v0.1 start/pause/seek/stop event test.

- [ ] **Step 5: Verify full native integration on current platform**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test mpv_session -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mpv
pnpm check:sensitive -- test-results/diagnostics.json test-results/app.log
```

Expected: all fake mpv scenarios pass; endpoint security/cleanup remains green; output contains no URL, token, request header, or subtitle text; sensitive scan has zero findings.

- [ ] **Step 6: Commit fake mpv integration coverage**

```bash
git add tests/integration/support/fake-mpv.mjs apps/desktop/src-tauri/tests/mpv_session.rs
git commit -m "test: cover player basics through fake mpv"
```

## Task 8: 端到端基础控制、实机证据与合并门禁

**可独立验收：** 浏览器 E2E 验证 UI→store→具名 engine 的全部行为；macOS/Windows 实机记录真实 mpv 基础控制；完整 v0.1 Alpha 回归、凭证扫描和前置门禁全部满足后才允许合并。

**Files:**
- Modify: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/player-basics.spec.ts`
- Create: `docs/release/v0.2-player-basics-acceptance.md`

**Interfaces:**
- Consumes: completed application, `FakePlayerEngine`, v0.1 acceptance commands and package workflows.
- Produces: deterministic E2E controller methods and唯一 v0.2 Player Basics 验收记录。

- [ ] **Step 1: Extend the E2E controller with exact player-basic actions**

```ts
// additions to tests/e2e/fixtures.ts
export type FakeMpvController = {
  advanceTo(seconds: number): Promise<void>
  replaceMedia(info: PlayerMediaInfo): Promise<void>
  failNext(action: PlayerControlAction, error: unknown): Promise<void>
  controlState(): Promise<PlayerControlState>
  mediaInfo(): Promise<PlayerMediaInfo>
  close(): Promise<void>
}
```

Each method calls the compile-time `window.__LUMAROUTE_E2E__.player` surface. The E2E build remains gated by `VITE_E2E=1`; production builds do not expose `replaceMedia` or `failNext`.

- [ ] **Step 2: Write the failing complete Player Basics browser journey**

```ts
// tests/e2e/player-basics.spec.ts
import { expect, test } from './fixtures'

test('controls volume fullscreen tracks subtitles and chapters from player truth', async ({
  page,
  seedAuthenticatedProfiles,
  fakeMpv,
}) => {
  await seedAuthenticatedProfiles(page)
  await page.getByTestId('library-movies').click()
  await page.getByText('Arrival').click()

  await expect(page.getByTestId('player-volume')).toBeDisabled()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('player-state')).toHaveText('播放中')

  await fakeMpv.replaceMedia(playerBasicsMediaInfo)
  await page.getByTestId('player-volume').fill('35')
  await page.getByTestId('player-mute').click()
  await page.getByTestId('player-fullscreen').click()
  await page.getByTestId('audio-track-2').click()
  await page.getByTestId('subtitle-off').click()
  await page.getByTestId('chapter-1').click()

  await expect.poll(() => fakeMpv.controlState()).toEqual({
    volume: 35,
    muted: true,
    fullscreen: true,
  })
  await expect.poll(() => fakeMpv.mediaInfo()).toMatchObject({
    audioTracks: expect.arrayContaining([
      expect.objectContaining({ id: '2', selected: true }),
    ]),
    subtitleTracks: expect.not.arrayContaining([
      expect.objectContaining({ selected: true }),
    ]),
    chapters: expect.arrayContaining([
      expect.objectContaining({ index: 1, selected: true }),
    ]),
  })
})

test('refreshes stale track ids and keeps playback active', async ({
  page,
  seedAuthenticatedProfiles,
  fakeMpv,
}) => {
  await seedAuthenticatedProfiles(page)
  await startArrival(page)
  await fakeMpv.replaceMedia(playerBasicsMediaInfo)
  await fakeMpv.replaceMedia(changedIdMediaInfo)
  await fakeMpv.failNext('select-audio-track', {
    code: 'InvalidTrack',
    message: 'track no longer exists',
  })
  await page.getByTestId('audio-track-11').click()
  await expect(page.getByRole('alert')).toContainText('媒体轨道已变化，请重新选择')
  await expect(page.getByTestId('player-state')).toHaveText('播放中')
})
```

- [ ] **Step 3: Run E2E to verify the red state**

Run:

```bash
VITE_E2E=1 pnpm test:e2e -- player-basics.spec.ts
```

Expected: FAIL before the controller and complete UI journey are wired.

- [ ] **Step 4: Implement the E2E controller and verify all browser journeys**

Run:

```bash
VITE_E2E=1 pnpm test:e2e -- player-basics.spec.ts
VITE_E2E=1 pnpm test:e2e -- browse-search-play.spec.ts
```

Expected: both Player Basics scenarios pass; original browse/search/play/progress scenario remains green; no test uses fixed-interval player polling.

- [ ] **Step 5: Create the explicit acceptance record**

```markdown
# LumaRoute v0.2 Player Basics Acceptance

## Merge prerequisite

- [ ] v0.1 Internal Alpha is marked passed in `docs/release/v0.1-acceptance.md`.
- [ ] v0.2 branch contains no v0.1-only acceptance workaround.

## Automated evidence

- [ ] `PlayerEngine` exposes only named controls and snapshots.
- [ ] TypeScript and Rust reject invalid volume, track IDs, and chapter indexes.
- [ ] High-frequency control state is event-driven; no fixed player polling exists.
- [ ] Media notifications coalesce and arrays are fetched as low-frequency snapshots.
- [ ] Control events do not trigger playback progress reports.
- [ ] Fake mpv covers all controls, media ID changes, command failure, and disconnect.
- [ ] Existing random/private IPC and cleanup tests pass on Unix and Windows.
- [ ] Original startup failover, direct play/direct stream, and ten-second progress tests pass.
- [ ] Credential leakage scan reports zero findings.

## macOS real-system evidence

- [ ] Volume/mute matches audible output.
- [ ] Enter/exit mpv fullscreen works.
- [ ] Two audio tracks switch audibly and selected state follows mpv.
- [ ] Embedded/external subtitle selection and subtitle off work.
- [ ] Both chapters seek to the expected positions.
- [ ] Loading a second media file refreshes track/chapter IDs.
- [ ] Stop/app exit cleans mpv process and IPC resources.

## Windows x64 real-system evidence

- [ ] Volume/mute matches audible output.
- [ ] Enter/exit mpv fullscreen works.
- [ ] Two audio tracks switch audibly and selected state follows mpv.
- [ ] Embedded/external subtitle selection and subtitle off work.
- [ ] Both chapters seek to the expected positions.
- [ ] Loading a second media file refreshes track/chapter IDs.
- [ ] Stop/app exit cleans mpv process and IPC resources.

## Full Alpha regression

- [ ] `pnpm acceptance` passes after v0.2 changes.
- [ ] Windows, both macOS architectures, and Linux package jobs pass.
- [ ] macOS and Windows Emby/Jellyfin real-system Alpha loops pass again.
```

Each checked item receives a CI run URL or tester/date/OS/mpv-build/package identifier and observed result. Environment limitations stay unchecked with a concrete reason; unchecked merge prerequisites block merge.

- [ ] **Step 6: Run the complete local quality and Alpha regression gate**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:rust
pnpm test:integration
VITE_E2E=1 pnpm test:e2e
pnpm check:boundaries
pnpm check:sensitive -- test-results/diagnostics.json test-results/app.log
pnpm check:mpv
git diff --check
```

Expected: every command exits 0; v0.1 and v0.2 tests pass; boundary scan finds no forbidden dependency; sensitive scan reports zero findings; `git diff --check` prints no output.

- [ ] **Step 7: Run package and real-system gates**

Run:

```bash
gh workflow run package.yml
gh run watch --exit-status
```

Expected: Windows x64 MSI/NSIS, macOS Intel/Apple Silicon artifacts, and Linux x64 AppImage/deb jobs are green with SHA-256 siblings. Record the workflow URL in the acceptance document.

On the generated macOS and Windows packages, use controlled media containing exactly two audio tracks, one embedded subtitle track, one external subtitle track, and two chapters. Complete every real-system checkbox for both Emby and Jellyfin. A hardware/software decode limitation may be recorded, but a failed basic control or cleanup check blocks merge.

- [ ] **Step 8: Enforce the final merge decision**

Do not merge when any of these is true:

1. `docs/release/v0.1-acceptance.md` does not mark Internal Alpha passed.
2. The complete Alpha regression after v0.2 is not green.
3. macOS or Windows lacks Emby/Jellyfin Player Basics evidence.
4. Package matrix or SHA-256 generation is incomplete.
5. Credential leakage scan has any finding.
6. A generic mpv command/property API, fixed polling loop, libmpv, or sidecar architecture appears in the diff.

Expected when mergeable: every non-public-release checkbox in `docs/release/v0.2-player-basics-acceptance.md` is checked with evidence, and the PR diff contains only the exact files owned by Tasks 1–8.

- [ ] **Step 9: Commit E2E and acceptance evidence**

```bash
git add tests/e2e/fixtures.ts tests/e2e/player-basics.spec.ts docs/release/v0.2-player-basics-acceptance.md
git commit -m "test: gate player basics with alpha regression"
```

## Plan Author Self-Review Record

- [x] Spec §§1–2 goal/non-goals: Global Constraints and Tasks 1–8 preserve independent mpv, exclude libmpv/Go sidecar/transcoding/advanced playback, and add exactly six basic capability groups.
- [x] Spec §3 layering and explicit capabilities: Stable Interfaces and Tasks 1–4 keep player/desktop/Rust boundaries and contain no generic command/property API.
- [x] Spec §4 domain model: Task 1 defines every field exactly; Task 2 maps missing values to `null`/`false`/empty arrays; Rust `snake_case` plus serde camelCase matches TypeScript fields.
- [x] Spec §5 event model: Tasks 2, 3, and 5 cover event-driven control snapshots, one initial read, low-frequency invalidation, notification coalescing, and no arrays in high-frequency events.
- [x] Spec §6 data flow and allowlist: Tasks 2–4 implement Vue/store/engine/Tauri/`PlayerControl`/`MpvSession`/JSON IPC with the exact fixed properties.
- [x] Spec §7 UI: Tasks 5–6 cover disabled no-session controls, fallback labels, flags, explicit selection, subtitle off, sorted/formatted chapters, and mpv-authoritative selection.
- [x] Spec §8 errors/security: Tasks 2–7 cover dual-boundary validation, stale track refresh, empty states, command failure, IPC disconnect, no fabricated success, and sanitized output.
- [x] Spec §9 TypeScript/Rust/integration/real-machine tests: Tasks 1–8 map every listed test class, including progress isolation, permissions/cleanup, fake mpv media changes/failures, and macOS/Windows checks.
- [x] Spec §10 acceptance: Task 8 maps all nine acceptance outcomes and makes v0.1 Internal Alpha plus complete rerun an explicit merge blocker.
- [x] v0.1 compatibility: existing startup failover, direct play/direct stream, timeline events, progress cadence, endpoint permissions, cleanup, package matrix, and leakage scans remain in scoped and final commands.
- [x] Exact file inventory: every task path is listed in the front inventory; no implementation task owns files outside that inventory.
- [x] Interface consistency: `volume`, `muted`, `fullscreen`, `audioTracks`, `subtitleTracks`, `chapters`, `startSeconds`, `isDefault`, `isForced`, `isExternal`, command argument names, event discriminants, and Rust serde names are consistent across all tasks.
- [x] Placeholder scan: no incomplete marker, deferred implementation instruction, empty code step, or undefined neighboring interface remains.
- [x] Task ordering: contracts precede native protocol, native protocol precedes session/commands, adapters precede store, store precedes UI, and all automated layers precede acceptance/merge gates.
