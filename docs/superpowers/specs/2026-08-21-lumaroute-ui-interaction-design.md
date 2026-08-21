# LumaRoute UI/UX 交互美化设计说明

- 日期：2026-08-21
- 状态：已批准（真实数据可执行版）
- 视觉基调：**Fluent Aurora & Neo-Glass（极简毛玻璃与现代影音中枢）**
- 参考来源：Nowen Video（Aurora / Neo-Glass 体系与详情页工作区）、Gemini 原型设计（仅借鉴 Bento 与节点卡视觉构图）、SenPlayer（仅借鉴独立播放器 HUD 的信息层级）

---

## 1. 目标与定位

当前 LumaRoute 的核心功能闭环已建立，但 UI 处于工程原型状态。本阶段目标是将整个桌面端交互与视觉升级为**现代专业、高品质、高信息密度的影视播放中枢**：

1. **统一的 Fluent Aurora 视觉体系**：基于深色画布（`#0b0f19`）与现代毛玻璃（Neo-Glass）表面，配合克制的系统级光晕与高对比文字层级。
2. **在既有信息架构上提升沉浸感**：
   - 保留左侧服务器/媒体库导航；顶栏 HUD 展示当前服务器搜索、真实活动线路与连接状态。
   - 首页使用真实 `continueWatching`、播放位置、媒体库和连接状态组成 Bento/货架流。
   - 媒体库与当前服务器搜索共用响应式虚拟海报墙。
   - 详情页使用 Primary 海报、CSS Aurora 光晕、真实最小元数据和季/剧集工作区（Episode Deck）。
   - 线路管理使用真实 `ServerLine` 字段和会话活动线路组成节点卡。
   - 播放继续由详情页发起；v0.1 播放 HUD 只提供已实现的暂停/恢复/跳转/停止与真实播放计划摘要。
3. **严格遵守架构与安全边界**：
   - 纯前端与样式层重构，不破坏 `@lumaroute/core` 与平台适配层契约。
   - 图片加载严格保持通过 `useSecureImage` 安全管道拉取，禁止在 DOM 或 URL 中泄漏 Token。
   - 使用原生 CSS 变量、共享 class 与 Vue SFC scoped CSS；不引入 Tailwind、远程字体、图标库或大型 UI 组件库。
4. **数据真实性优先**：
   - UI 只能显示当前领域类型、应用服务或 store 已真实提供的数据。
   - 字段缺失时省略对应元素或显示明确空态，不使用 mock、随机值、硬编码评分、推断协议或营销文案补齐原型。
   - `activeLineId` 表示最近一次真实请求或播放启动使用的线路；`preferredLineId` 只表示用户偏好，两者不得混淆。

---

## 2. 视觉语言与设计系统 (Design Tokens)

### 2.1 色彩系统 (Aurora Neo-Glass)

| 语义 Token                | 取值 (Dark)                 | 用途说明                                             |
| ------------------------- | --------------------------- | ---------------------------------------------------- |
| `--lr-bg-base`            | `#080c14`                   | 全局暗色背景底色                                     |
| `--lr-bg-canvas`          | `#0d1322`                   | 主工作区与内容区表面                                 |
| `--lr-surface-card`       | `rgba(15, 23, 42, 0.70)`    | 毛玻璃卡片表面（配合 `backdrop-filter: blur(16px)`） |
| `--lr-surface-card-hover` | `rgba(30, 41, 59, 0.85)`    | 悬浮抬升态表面                                       |
| `--lr-surface-active`     | `rgba(15, 28, 50, 0.90)`    | 选中态卡片（带高亮边框）                             |
| `--lr-border-subtle`      | `rgba(255, 255, 255, 0.08)` | 默认微弱分割线与边框                                 |
| `--lr-border-hover`       | `rgba(6, 182, 212, 0.40)`   | 悬浮与聚焦强调边框                                   |
| `--lr-accent-cyan`        | `#06b6d4` (Cyan-500)        | 核心主色、活动线路、播放主按钮                       |
| `--lr-accent-blue`        | `#3b82f6` (Blue-500)        | 次要高亮、渐变混色                                   |
| `--lr-accent-emerald`     | `#10b981` (Emerald-500)     | 连接健康、直放正常与成功状态                         |
| `--lr-accent-amber`       | `#f59e0b` (Amber-500)       | 检查中与需要注意的状态                               |
| `--lr-accent-rose`        | `#f43f5e` (Rose-500)        | 错误、危险操作与连接失败                             |
| `--lr-accent-purple`      | `#8b5cf6` (Purple-500)      | 已有播放计划中的编码辅助标记                         |
| `--lr-text-primary`       | `#f8fafc`                   | 主标题、核心元数据                                   |
| `--lr-text-secondary`     | `#94a3b8`                   | 次要描述、副标题、技术参数                           |
| `--lr-text-muted`         | `#64748b`                   | 占位符、微小说明文案                                 |

### 2.2 材质与投影 (Elevation & Acrylic Glass)

```css
/* 毛玻璃卡片基础类 */
.lr-glass-card {
  background: var(--lr-surface-card);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--lr-border-subtle);
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.08),
    0 10px 25px -5px rgba(0, 0, 0, 0.45);
  border-radius: 1rem;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.lr-glass-card:hover {
  background: var(--lr-surface-card-hover);
  border-color: var(--lr-border-hover);
  transform: translateY(-2px);
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.15),
    0 16px 32px -8px rgba(6, 182, 212, 0.18);
}
```

### 2.3 字阶与排版

- **字体栈**：使用跨平台系统字体栈，例如 `"PingFang SC", "Segoe UI", "Hiragino Sans GB", sans-serif`；数字与技术参数使用 `ui-monospace, SFMono-Regular, Menlo, monospace`。
- 不下载、捆绑或运行时加载远程字体；设计不能依赖用户设备恰好安装某个第三方字体。
- **字阶**：
  - Hero 标题：`2.25rem ~ 2.75rem` / ExtraBold
  - 区块标题：`1.25rem ~ 1.5rem` / Bold
  - 卡片标题：`0.9375rem` / SemiBold
  - 正文与描述：`0.875rem` / Regular (行高 1.6)
  - 规格胶囊与时间戳：`0.75rem` / Mono

---

## 3. 信息架构与核心视图规范

### 3.1 顶栏中枢 HUD (`AppShell.vue`)

```text
┌──────────────┬────────────────────────────────────────────────────────────────┐
│ 左侧导航     │ HUD：[当前服务器] [当前服务器内搜索 ⌘/Ctrl K] [活动线路状态] │
│ 服务器/媒体库├────────────────────────────────────────────────────────────────┤
│ 服务器设置   │ RouterView                                                     │
└──────────────┴────────────────────────────────────────────────────────────────┘
```

1. **保留左侧导航**：
   - 品牌入口、逻辑服务器切换、当前服务器媒体库列表和服务器设置继续位于左侧。
   - 本阶段不创建收藏夹、线路拓扑或聚合首页路由。
2. **顶栏 HUD**：
   - 展示当前服务器名称、连接状态和搜索框；`⌘K` / `Ctrl+K` 只聚焦搜索框。
   - 搜索范围始终是当前逻辑服务器，不使用“全局搜索”“搜全库”等暗示跨服聚合的文案。
3. **活动线路指示器**：
   - 仅当 `mediaStore.activeLineId` 对应当前 Profile 中真实线路时显示“当前线路”及其标签。
   - 没有活动线路事实时显示“尚无活动线路”，不得回退到 `preferredLineId` 并称其为当前线路。
   - 状态颜色只映射已有 `healthy/checking/unhealthy/unknown`；不显示延迟、丢包或吞吐。
4. **设置与诊断入口**：
   - 复用现有服务器设置路由和脱敏诊断能力，不添加依赖图标库的入口。

---

### 3.2 首页 Bento/货架流 (`HomeView.vue`)

首页采用由真实数据组成的 **Bento 矩阵 + 横向内容货架**：

```text
┌──────────────────────────────┬─────────────────────────────────────────────────┐
│ 当前连接                     │ 继续观看                                        │
│ 活动线路标签 / 连接状态      │ [海报 + 真实进度] [海报 + 真实进度] →          │
├──────────────────────────────┴─────────────────────────────────────────────────┤
│ 媒体库：[真实库名称 / collectionType] [真实库名称 / collectionType]          │
└────────────────────────────────────────────────────────────────────────────────┘
```

1. **当前连接卡**：
   - 显示真实活动线路标签和连接状态；没有 `activeLineId` 时显示明确空态。
   - 不显示实时延迟、协议模式、测速操作或首选线路冒充的活动状态。
2. **继续观看货架**：
   - 数据只来自当前服务器 `getContinueWatching`。
   - 进度百分比仅由 `playbackPositionSeconds / runtimeSeconds` 计算；时长缺失或非法时省略进度条。
   - 点击卡片进入现有详情/续播流程，不增加悬浮试听。
3. **媒体库 Bento**：
   - 只显示 `Library.name` 与可用的 `collectionType`，点击进入现有库路由。
   - 不显示内容数量、虚构分类、推荐流、最新流或 Spotlight Hero。

---

### 3.3 媒体库与搜索 (`LibraryView.vue` & `SearchView.vue`)

1. **响应式多列虚拟海报墙 (`VirtualPosterGrid.vue`)**：
   - 保持基于 `@tanstack/vue-virtual` 的按行虚拟化、多列自适应网格和服务端分页。
   - 宽窗口最多 6 列；窄窗口允许 1–2 列，避免固定最少 3 列造成不可用。
   - 保持懒加载、触底加载和大媒体库的有界 DOM 节点数。
2. **现代化媒体卡片 (`MediaCard.vue`)**：
   - Primary 海报严格遵循 `2:3` 比例，并继续通过 `useSecureImage` 加载 Blob URL。
   - 只显示 `MediaItem` 已有的标题、年份和 kind；缺失字段直接省略。
   - 鼠标悬浮可轻微抬升（`translateY(-4px)`），键盘焦点必须同样清晰。
   - 不显示评分、收藏、4K/技术规格或悬浮播放按钮；列表中的 series 没有直接播放语义。
3. **搜索范围**：
   - 搜索输入、防抖和结果只调用当前服务器的 `MediaService.search`。
   - 结果标题明确标注“当前服务器”，切换服务器时沿用现有取消请求与缓存隔离行为。

---

### 3.4 媒体详情沉浸页 (`MediaDetailView.vue`)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [CSS Aurora 光晕与渐变，不使用假背景图]                                     │
│ ┌──────────┐  kind · 年份 · 时长                                             │
│ │ Primary  │  标题                                                           │
│ │ 海报 2:3 │  简介                                                           │
│ └──────────┘  [播放] [继续播放 14:20]                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ Episode Deck：[S1] [S2] → [E01 标题] [E02 标题] …                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

1. **Aurora 沉浸头部**：
   - 使用 Primary 海报、深色玻璃表面和 CSS radial gradients 建立视觉层级。
   - 当前领域与图片加载器没有 Backdrop tag/kind；不得把 Primary 海报放大、模糊或裁切后冒充 Backdrop。
2. **核心元数据排布**：
   - 左侧圆角 Primary 海报，右侧只显示标题、年份、kind、时长、简介和真实续播位置。
   - 电影/单集沿用现有 `[播放]` 与 `[继续播放]`；不增加收藏或预播放技术规格。
3. **选集 Deck 工作区 (TV 剧集专属)**：
   - 使用现有 `getItems(parentId, kinds)` 请求真实季和剧集。
   - 单集显示真实 `indexNumber` 和名称；当前模型没有已看完布尔值，不增加“已看完”标记。
4. **播放后事实**：
   - 容器、视频/音频 codec、码率和 direct-play/direct-stream 只存在于已生成的 `PlaybackPlan`，只能在活动播放 HUD 中显示。
   - 详情加载阶段不显示分辨率、HDR、Atmos、声道、codec、容器或直放判定。

---

### 3.5 线路管理与拓扑矩阵 (`ServerSettingsView.vue`)

将传统表格升级为**真实线路节点卡矩阵**：

1. **线路节点卡片 (Route Node Card)**：
   - 显示 `ServerLine` 的真实标签、BaseUrl、priority、enabled 和从 URL 解析出的 HTTP/HTTPS。
   - 状态徽章只包括 `[首选线路]`、`[当前线路]`、`[已禁用]`。
   - `[当前线路]` 仅来自当前 Profile 内有效的 `mediaStore.activeLineId`；`preferredLineId` 只产生 `[首选线路]`。
   - ServerId 一致性只在添加线路的真实验证结果中显示，不持久化为每条线路的永久“已匹配”徽章。
   - 保留当前已实现的设为首选、启停、上下调整优先级和敏感地址标记；添加线路继续走现有验证流程。
2. **现有验证状态**：
   - 复用添加线路时的测试中、成功、超时、认证失败与 ServerId 不一致状态。
   - 当前没有线路遥测接口，不显示延迟、丢包、吞吐、QUIC/gRPC，也不提供一键全链路测速。
3. **安全与诊断面板**：
   - 一键复制脱敏诊断信息（自动剔除 Token/密码），带复制成功 Toast 反馈。

---

### 3.6 现代播放器 HUD 控制栏 (`PlayerControls.vue`)

本阶段只美化独立 mpv 进程架构下已经实现的 v0.1 WebView 控制 HUD：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 播放状态        [原文件直放] [MKV] [HEVC] [AAC] [8.0 Mbps] [线路标签]      │
│ 04:15 [━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━] 24:00                  │
│ [播放/暂停/恢复] [停止]                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

1. **状态与播放计划 HUD**：
   - 显示现有 `playerStore` 的 idle/loading/playing/paused/error、位置和时长。
   - `activePlan` 存在后，可以显示真实 method、container、videoCodec、audioCodec 和 bitrate；字段为 `null` 时省略。
   - 活动线路只能来自 `playerStore.activeLineId`，并解析为当前 Profile 中的真实线路标签。
2. **进度条**：
   - 使用现有 position/duration 和 seek 能力，不虚构缓冲进度或预览缩略图。
3. **控制操作区**：
   - 播放入口仍在详情页；HUD 只包含现有 pause/resume/seek/stop。
   - 不新增 ±10 秒、音量、倍速、全屏、音轨、字幕或章节按钮。
4. **v0.2 追加门禁**：
   - 音量、静音、全屏、音轨、字幕和章节已由 `2026-08-21-lumaroute-v0.2-player-basics-design.md` 单独设计。
   - 这些 UI 只能在 v0.2 契约、store、Tauri/Rust 与测试合并后追加；本 spec 不提前创建空面板或假状态。
   - 倍速、缓冲预览和内嵌播放器不属于 v0.2 Player Basics，仍需后续独立设计。

---

## 4. 前端工程与性能保障

1. **轻量与零额外运行时开销**：
   - 使用 Vue 3 Composition API、原生 CSS variables、少量共享 class 和 SFC scoped CSS。
   - 不引入 Tailwind、UnoCSS、Ant Design、Element Plus、Naive UI、远程字体或图标库。
2. **长列表性能治理**：
   - `VirtualPosterGrid` 继续只渲染视口附近的虚拟行；10,000 项测试必须保持有界 DOM 节点数。
   - 不承诺所有设备固定 60fps；自动化验证结构上限，实机验证滚动稳定性。
3. **图片安全与缓存**：
   - 当前只加载 Primary 海报，经 `useSecureImage` 内部安全转换与 Blob URL 缓存。
   - Token 不进入 DOM、图片 URL、普通日志或测试夹具。
4. **动画与微交互**：
   - 过渡时间统一采用 `150ms ~ 250ms`，曲线使用 `cubic-bezier(0.16, 1, 0.3, 1)`（自然回弹与平滑感），避免拖泥带水。
   - 支持 `prefers-reduced-motion: reduce`；毛玻璃不可用时提供不透明背景与可读边框。
5. **数据和组件边界**：
   - Vue 页面继续只调用 stores/application services；不得直接解析服务端 DTO。
   - `packages/core`、`packages/player` 与 `src-tauri` 不因本视觉阶段改变。
   - 远程查询、虚拟化、分页、切服取消请求和现有 `data-testid` 契约保持稳定。

---

## 5. 实施优先级与交付序列

| 批次                       | 模块                               | 核心改动                                                            | 预估影响文件                                                      |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Phase 1: 基础系统**      | Design Tokens & 全局样式           | Fluent Aurora 色板、玻璃基础类、排版、焦点态、降级与 reduced-motion | `styles.css`, `OnboardingView.vue`                                |
| **Phase 2: 框架中枢**      | `AppShell` & HUD 顶栏              | 保留左侧导航、当前服务器搜索快捷键、真实活动线路和连接状态          | `AppShell.vue`, `ServerSwitcher.vue`, `LibrarySidebar.vue`        |
| **Phase 3: 首页矩阵**      | `HomeView` Bento 重构              | 当前连接、真实继续观看进度货架、真实媒体库卡片                      | `HomeView.vue`, `ContinueWatchingCard.vue`                        |
| **Phase 4: 海报墙升级**    | `VirtualPosterGrid` 与 `MediaCard` | 1–6 列虚拟网格、2:3 安全海报、真实年份/kind                         | `VirtualPosterGrid.vue`, `MediaCard.vue`                          |
| **Phase 5: 详情沉浸**      | `MediaDetailView`                  | Primary 海报 + CSS Aurora hero、真实最小元数据、Episode Deck        | `MediaDetailView.vue`                                             |
| **Phase 6: 线路节点**      | `ServerSettingsView`               | HTTP/HTTPS、当前/首选/禁用、真实添加验证与诊断反馈                  | `ServerSettingsView.vue`, `LineEditor.vue`, `DiagnosticPanel.vue` |
| **Phase 7: v0.1 播放 HUD** | `PlayerControls`                   | 现有控制视觉、真实 position/duration、播放后的 `PlaybackPlan` 摘要  | `PlayerControls.vue`                                              |

---

## 6. 验收标准

1. 页面整体视觉呈现统一的高品质 Fluent Aurora 暗色毛玻璃质感，消除原型的单调与简陋感。
2. 左侧服务器/媒体库导航保留；`⌘K/Ctrl+K` 只聚焦当前服务器搜索。
3. 首页只使用真实活动线路、连接状态、继续观看、播放位置和媒体库数据。
4. 媒体库/搜索呈现 1–6 列响应式虚拟海报墙，分页、懒加载和有界 DOM 测试保持通过。
5. 详情页使用 Primary 海报和 CSS Aurora hero，支持真实播放/续播与季/集选择，不出现 Backdrop、评分、收藏或假技术规格。
6. 线路节点只显示真实 HTTP/HTTPS、首选、当前、禁用和添加验证状态；当前与首选含义不混淆。
7. 详情页继续发起播放；v0.1 播放 HUD 保留 pause/resume/seek/stop，并只在 `activePlan` 存在后显示真实播放计划字段。
8. UI 不出现实时延迟、丢包、吞吐、QUIC/gRPC、一键全链路测速、倍速或内嵌播放器。
9. 不新增 Tailwind、远程字体、图标库或 UI 组件库依赖。
10. 严格通过既有自动化质量门：`pnpm check`（无 linter 错误、TypeScript 严格通过）、测试用例全部绿灯、无凭证泄漏。

---

## 7. 后续独立设计

下列能力不属于本 spec 的验收范围。只有在独立 spec 定义领域模型、API、错误语义、缓存/持久化、安全边界与自动化测试后，UI 才能消费：

1. **媒体展示数据**：收藏、评分、推荐/最新、分类数量、genres、Backdrop、分辨率、HDR、声道和预播放技术规格。
2. **线路遥测**：延迟、丢包、吞吐、采样策略、历史结果、QUIC/gRPC 支持判断和一键全链路测速。
3. **跨服能力**：聚合首页、全局搜索、来源标识、去重和跨服错误隔离。
4. **播放器后续**：
   - v0.2 合并后追加音量、静音、全屏、音轨、字幕和章节 UI。
   - 倍速、缓冲预览、画中画和内嵌播放器需另行设计，不得借 v0.2 名义顺带实现。
