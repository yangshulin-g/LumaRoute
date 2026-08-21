# LumaRoute v0.2 Player Basics 设计

- 日期：2026-08-21
- 状态：已批准
- 前置门禁：v0.1 Internal Alpha 通过后才可合并
- 参考项目：Nowen Video 的桌面播放器状态分层与交互行为

## 1. 目标

本阶段在现有独立 mpv 进程架构上补齐桌面播放器的基础控制体验：

1. 音量设置与静音。
2. mpv 播放窗口全屏切换。
3. 音轨列表、当前音轨和明确选择。
4. 字幕轨列表、当前字幕、关闭字幕和明确选择。
5. 章节列表、当前章节和章节跳转。
6. 使用事件驱动同步控制状态，避免前端定时轮询。

本阶段不改变服务端适配器、线路策略和进度上报的领域边界。

## 2. 非目标

- 不内嵌 mpv 画面，不迁移到 libmpv Render API。
- 不引入 Go sidecar、本地媒体库、扫描、刮削或服务端转码。
- 不做在线字幕搜索、字幕下载或外挂字幕文件管理。
- 不做 HDR 调参、音频直通配置、Shader、Anime4K、RIFE 或高级画质设置。
- 不做播放中断自动换线。
- 不做画中画、复杂多窗口或自定义 mpv 参数界面。
- 不开放任意 mpv 命令或属性透传。

## 3. 架构原则

### 3.1 保持现有分层

- `packages/player` 定义稳定的播放器领域契约和事件类型。
- `apps/desktop` 负责 Vue 交互、显示状态和调用 `PlayerEngine`。
- `apps/desktop/src-tauri` 只负责具名 Tauri 命令、mpv 进程和受限 JSON IPC。
- `packages/core` 的播放计划、线路重试和进度策略不依赖具体播放器控件。

### 3.2 显式能力，不提供通用逃生口

`PlayerEngine` 增加具名能力：

```ts
interface PlayerEngine {
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

不得增加 `command(name, args)`、`setProperty(name, value)` 或等价通用接口。

## 4. 领域模型

`packages/player` 增加与 mpv 原始 JSON 解耦的类型：

```ts
interface PlayerControlState {
  volume: number
  muted: boolean
  fullscreen: boolean
}

interface AudioTrack {
  id: string
  title: string | null
  language: string | null
  codec: string | null
  selected: boolean
  isDefault: boolean
  isForced: boolean
  isExternal: boolean
}

interface SubtitleTrack {
  id: string
  title: string | null
  language: string | null
  codec: string | null
  selected: boolean
  isDefault: boolean
  isForced: boolean
  isExternal: boolean
}

interface Chapter {
  index: number
  title: string | null
  startSeconds: number
  selected: boolean
}

interface PlayerMediaInfo {
  audioTracks: AudioTrack[]
  subtitleTracks: SubtitleTrack[]
  chapters: Chapter[]
}
```

mpv 缺失字段统一映射为 `null`、`false` 或空数组。前端不得解析 mpv 的原始 `track-list` / `chapter-list`。

## 5. 状态与事件

播放器状态分成两类：

### 5.1 常用控制状态

播放位置、暂停、音量、静音和全屏通过 mpv `property-change` 事件持续同步。Rust 将其转换为稳定 `PlayerEvent` 后发到 `player://event`。

订阅建立后，前端读取一次初始快照；之后只消费事件，不设置固定间隔轮询。

### 5.2 低频媒体结构

音轨、字幕轨和章节属于低频结构数据：

1. 文件加载完成时发出 `media-info-changed`。
2. `track-list`、`chapter-list`、`aid`、`sid` 或 `chapter` 变化时再次通知。
3. 前端收到通知后调用 `getMediaInfo()` 获取完整标准化快照。
4. 多个连续通知必须合并，避免同一 mpv 事件批次重复读取。

完整轨道和章节数组不塞入高频位置事件。

## 6. 命令数据流

```text
Vue 控件
  → player-store
  → PlayerEngine 具名方法
  → Tauri 具名命令
  → PlayerControl 枚举
  → MpvSession 具名方法
  → 受限 mpv JSON IPC
```

Rust 仅允许本阶段需要的固定属性和命令：

- `volume`
- `mute`
- `fullscreen`
- `aid`
- `sid`
- `chapter`
- `track-list`
- `chapter-list`

每个 Tauri 命令使用显式输入和输出结构。Token、播放请求头和 URL 处理方式保持不变。

## 7. 前端交互

### 7.1 主控制条

`PlayerControls` 保留播放/暂停、跳转和停止，并增加：

- 音量滑块。
- 静音切换。
- 全屏切换。
- 音轨、字幕和章节面板入口。

无活跃播放会话时控件禁用，不发送命令。

### 7.2 音轨与字幕

- 显示标题、语言和 codec；缺少标题时使用可预测的回退文案。
- 音轨必须明确选择，不使用盲目 `cycle`。
- 字幕提供“关闭”选项，映射为 `selectSubtitleTrack(null)`。
- 默认、强制和外挂标记存在时显示为次要信息。
- 当前选择只以播放器返回状态为准，不做乐观永久覆盖。

### 7.3 章节

- 按开始时间排序。
- 显示标题和格式化开始时间。
- 无标题时使用“章节 N”。
- 选择章节调用 `seekToChapter(index)`。
- 章节跳转产生的播放位置变化继续通过既有位置事件和进度上报链路处理。

## 8. 错误处理

- 无播放会话：返回 `PlayerUnavailable`，界面提示先开始播放。
- 音量不在 `0..100`：TypeScript 和 Rust 边界都拒绝。
- 非有限数值、空轨道 ID、负章节索引：边界校验后拒绝，不发送给 mpv。
- 旧轨道 ID 因媒体切换失效：刷新 `PlayerMediaInfo`，提示用户重新选择，不停止播放。
- 无轨道或章节数据：展示空状态，不算播放错误。
- IPC 断开或 mpv 退出：沿用 `PlaybackFailed`，保留最后已知位置并提供既有重试动作。
- 控制命令失败不得伪造成功状态；下一次事件或快照仍以 mpv 为事实来源。

日志只记录会话状态、命令类别和脱敏错误，不记录播放 URL、请求头、私人服务器地址或字幕文本。

## 9. 测试

所有行为变更遵循先失败测试、再最小实现。

### 9.1 TypeScript

- `PlayerEngine` 契约与领域类型。
- `TauriPlayerEngine` 的参数映射和事件订阅。
- `player-store` 的控制状态、媒体信息刷新和连续通知合并。
- 控件禁用、选择状态、回退文案和错误提示。
- 进度上报不因音量、全屏或轨道变化而触发。

### 9.2 Rust

- 允许列表只接受固定属性和具名命令。
- mpv `property-change` 到领域事件的映射。
- `track-list` 和 `chapter-list` 的缺失、空值和异常字段处理。
- 无会话、非法参数、IPC 关闭和 mpv 错误。
- Unix Socket 与 Windows Named Pipe 的既有权限和清理测试保持通过。

### 9.3 集成

fake mpv 必须能够：

- 接收音量、静音、全屏、音轨、字幕和章节命令。
- 发出对应属性变化。
- 返回双音轨、字幕轨和章节列表。
- 模拟媒体切换后轨道 ID 变化。
- 模拟 IPC 断开和命令失败。

受控媒体至少包含：

- 两个音轨。
- 一个内嵌字幕轨。
- 一个外挂字幕轨。
- 两个章节。

### 9.4 实机

macOS 与 Windows 分别验证：

1. 音量和静音与实际输出一致。
2. 全屏进入和退出正确。
3. 音轨切换可听辨且状态同步。
4. 字幕关闭和轨道切换正确。
5. 章节跳转位置正确。
6. 切换媒体后结构数据刷新。
7. 关闭播放或应用后 mpv 与 IPC 资源清理。

## 10. 验收标准

1. 所有新能力只能通过 `PlayerEngine` 的具名接口调用。
2. 前端不存在固定间隔的播放器状态轮询。
3. 音量、静音和全屏状态以 mpv 事件为事实来源。
4. 音轨、字幕和章节使用低频完整快照，并与高频位置事件分离。
5. 音轨、字幕、章节缺失时播放仍可继续。
6. macOS 与 Windows 实机完成全部基础控制验证。
7. 原有播放启动换线、直放/直接串流和十秒进度上报测试保持通过。
8. 凭证泄漏扫描为零发现。
9. v0.1 Internal Alpha 完成后，本阶段变更重新通过完整 Alpha 回归才可合并。

## 11. 参考项目取舍

Nowen Video 可借鉴：

- 高频状态事件驱动。
- 低频轨道与章节信息按需读取。
- 明确选择音轨和字幕，而非盲目循环。
- 播放器 UI 不直接依赖 mpv 内部细节。

LumaRoute 不采用：

- Go Media Core sidecar。
- 本地媒体扫描与刮削。
- libmpv 内嵌渲染和 app-owned Render Surface。
- Web/mpv 双内核与服务端转码架构。

这些取舍确保 LumaRoute 继续聚焦 Emby/Jellyfin 多服多线路桌面客户端。
