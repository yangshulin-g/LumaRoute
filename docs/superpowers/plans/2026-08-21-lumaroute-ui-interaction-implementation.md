# LumaRoute UI/UX Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不伪造数据、不扩大 v0.1 产品范围且不改变既有分层的前提下，把当前桌面端升级为 Fluent Aurora / Neo-Glass 视觉，并只呈现现有 API、领域模型和已实现播放器契约能够真实提供的信息。

**Architecture:** 本计划只修改 `apps/desktop` 的 Vue 展示、纯展示格式化函数和现有 UI/E2E 测试；页面继续通过 Pinia/application services 工作，图片继续经过 `useSecureImage`。已修订 UI spec 把新领域数据、线路遥测、跨服能力或 v0.2 播放器契约列为后续独立设计，本计划只执行已批准的真实数据视觉范围。

**Tech Stack:** Vue 3.5、TypeScript 5.9、Pinia 4、Vue Router 5、TanStack Query 5、TanStack Virtual 3、原生 CSS 变量、Vitest 4、Vue Test Utils 2、Playwright；不新增 Tailwind、UI 组件库、图标库或字体运行时依赖。

## 已确认的范围决策（先读）

以下决策已写入修订后的 UI spec。Task 1–8 不通过 mock、硬编码徽章或推导不存在的数据还原原型；后续数据能力必须先完成独立设计和契约，再另写实施计划。

1. **原生 CSS**
   - 使用现有 `apps/desktop/src/styles.css`、共享 class 和 scoped CSS，不改 package 依赖。
   - 不新增 Tailwind、远程字体、图标库或大型 UI 组件库。

2. **左侧导航与当前服务器搜索**
   - 保留 v0.1 左侧服务器/媒体库导航，只把顶栏升级为 HUD。
   - `⌘K/Ctrl+K` 仅聚焦当前服务器搜索，不创建全局搜索、收藏夹或线路拓扑路由。

3. **媒体卡与 Home 只消费现有字段**
   - `MediaItem` 只有 `id/kind/name/overview/productionYear/runtimeSeconds/parentId/seriesId/indexNumber/imageTag/playbackPositionSeconds`。
   - 不显示收藏、评分、推荐、分类数量、悬浮试听或其他无事实来源的内容。

4. **Primary 海报与播放后技术事实**
   - `useSecureImage` 与 `SecureImageLoader` 只加载 `/Images/Primary`，详情使用 CSS Aurora 背景，不伪造 Backdrop。
   - `container/videoCodec/audioCodec/bitrate/method` 只在 `activePlan` 存在后显示；详情加载阶段不显示预播放技术规格。

5. **真实线路节点**
   - `ServerLine` 只有 `id/label/baseUrl/priority/enabled`，节点只额外从 URL 解析 HTTP/HTTPS。
   - 不显示实时延迟、丢包、吞吐、QUIC/gRPC 或一键全链路测速。

6. **v0.1 播放 HUD 与 v0.2 门禁**
   - 播放继续由详情页发起；当前 HUD 只美化 pause/resume/seek/stop 和真实 `PlaybackPlan`。
   - 音量、静音、全屏、音轨、字幕和章节在 v0.2 合并后追加；倍速、缓冲预览和内嵌播放器仍需独立设计。

7. **当前线路与首选线路分离**
   - `mediaStore.activeLineId` 与 `playerStore.activeLineId` 是最近一次请求/播放启动的真实线路；`preferredLineId` 只是偏好。
   - 没有会话活动线路时只显示“首选线路”，不得称其为“当前线路”。

8. **视觉事实来源收敛**
   - `docs/2026-08-11-ui-xiaohuan-direction.md` 已标记为被取代的历史记录。
   - 深色 Fluent Aurora 以修订后的 2026-08-21 UI spec 为唯一视觉设计来源。

## Global Constraints

- 产品/架构事实以 `docs/superpowers/specs/2026-08-07-lumaroute-v0.1-design.md` 为准；UI 视觉目标以本计划已经消除冲突后的可执行切片为准。
- 支持平台保持 Windows、macOS、Linux；桌面框架保持 Tauri 2，前端保持 Vue 3 + TypeScript。
- `packages/core` 与 `packages/player` 不因本计划修改；Rust/Tauri 原生层不因本计划修改。
- 播放器继续使用独立 mpv 进程，不在 WebView 内嵌播放画面。
- 页面不解析服务端 DTO，不直接访问 SQLite、凭证、HTTP 传输或 mpv IPC。
- 搜索始终限定当前逻辑服务器；不新增跨服聚合、跨源匹配或收藏能力。
- 图片只能通过 `useSecureImage` → `SecureImageLoader` 的 Blob URL 管道加载；Token 不进入 DOM、图片 URL、日志、夹具或快照。
- 只展示领域对象或 store 当前真实存在的字段；字段缺失时省略对应 UI，不使用演示值、随机值、硬编码评分或协议。
- 保留现有路由、`data-testid`、键盘可达性、分页、虚拟化、懒加载和切服取消请求行为。
- 动画时间限制为 `150ms–250ms`，支持 `prefers-reduced-motion: reduce`；毛玻璃不可用时仍有不透明背景和可读边框。
- 使用原生 CSS 变量与 scoped CSS；不新增 Tailwind、Element Plus、Naive UI、Ant Design、图标字体或远程字体。
- 所有行为变更遵循失败测试 → 最小实现 → 通过测试；纯样式 token 通过文本契约测试和现有组件行为回归验证。
- 每个任务结束先运行指定测试，再运行 `pnpm --filter @lumaroute/desktop typecheck`；最终运行 `pnpm check`、相关 E2E 与 `git diff --check`。
- 本计划中的 commit 命令只供未来实施会话执行；编写本计划的会话不提交。

---

## 事实审计与可立即执行范围

### 当前已实现且可复用

- `AppShell`：左侧服务器/媒体库导航、顶栏当前服务器搜索、真实线路标签。
- `HomeView`：真实 continue watching 与 libraries；`MediaItem` 可计算已播百分比。
- `VirtualPosterGrid`：按行虚拟化、多列自适应、分页触底加载；无需重写虚拟化架构。
- `MediaCard` / `MediaDetailView`：Primary 海报通过 `useSecureImage` 安全加载。
- `MediaDetailView`：真实标题、年份、简介、时长、续播位置、季和剧集。
- `ServerSettingsView`：服务器/线路 CRUD、排序、启停、首选线路、敏感地址标记、单次 ServerId 验证与脱敏诊断。
- `PlayerControls`：暂停/恢复/跳转/停止；详情页负责发起播放，`playerStore.activePlan` 有播放后的容器、编解码、码率与播放方法。

### 本计划交付

- 深色 Aurora tokens、玻璃表面、统一排版、焦点态、降级与 reduced-motion。
- 保留侧栏的信息架构，升级品牌区、顶栏 HUD、当前服务器搜索快捷键和真实连接状态。
- 用真实继续观看、真实进度、真实媒体库构成 Home Bento；不造 Spotlight 或推荐。
- 巩固 1–6 列响应式虚拟海报墙和 2:3 现代媒体卡；窄窗口允许 1–2 列以保证可用性。
- 用 Primary 海报 + CSS 光晕完成详情沉浸头图，用真实季/集数据完成 Episode Deck。
- 用真实线路字段完成节点卡；用实际请求的 active line 区分“当前”与“首选”。
- 美化现有 v0.1 播放 HUD，并在播放计划存在时显示真实 direct-play/direct-stream、容器、codec 和码率。
- 增加快捷键、进度、真实线路标记及安全图片的自动化验收。

## 精确文件清单

### Create

- `apps/desktop/src/styles.test.ts` — 全局 token、无 Tailwind 和 reduced-motion 契约。
- `apps/desktop/src/presentation/media-presenters.ts` — 只格式化 `MediaItem`/`PlaybackPlan` 已有字段。
- `apps/desktop/src/presentation/media-presenters.test.ts` — 进度和播放计划展示契约。
- `apps/desktop/src/presentation/line-presenters.ts` — 从 `ServerProfile/ServerLine` 解析真实标签、协议和状态。
- `apps/desktop/src/presentation/line-presenters.test.ts` — 当前/首选和 HTTP/HTTPS 展示契约。
- `apps/desktop/src/components/ContinueWatchingCard.vue` — 真实续播进度卡。
- `apps/desktop/src/components/ContinueWatchingCard.test.ts` — 进度存在/缺失行为。
- `apps/desktop/src/components/DiagnosticPanel.test.ts` — 复制成功反馈。
- `apps/desktop/src/components/PlayerControls.test.ts` — v0.1 HUD 和真实播放计划信息。

### Modify

- `apps/desktop/src/styles.css`
- `apps/desktop/src/components/AppShell.vue`
- `apps/desktop/src/components/AppShell.test.ts`
- `apps/desktop/src/components/ServerSwitcher.vue`
- `apps/desktop/src/components/LibrarySidebar.vue`
- `apps/desktop/src/components/VirtualPosterGrid.vue`
- `apps/desktop/src/components/VirtualPosterGrid.test.ts`
- `apps/desktop/src/components/MediaCard.vue`
- `apps/desktop/src/components/PlayerControls.vue`
- `apps/desktop/src/components/DiagnosticPanel.vue`
- `apps/desktop/src/views/OnboardingView.vue`
- `apps/desktop/src/views/HomeView.vue`
- `apps/desktop/src/views/HomeView.test.ts`
- `apps/desktop/src/views/LibraryView.vue`
- `apps/desktop/src/views/SearchView.vue`
- `apps/desktop/src/views/MediaDetailView.vue`
- `apps/desktop/src/views/MediaDetailView.test.ts`
- `apps/desktop/src/views/ServerSettingsView.vue`
- `apps/desktop/src/views/ServerSettingsView.test.ts`
- `apps/desktop/src/router/index.ts`
- `tests/e2e/browse-search-play.spec.ts`

### Explicitly unchanged

- `apps/desktop/package.json`
- `packages/core/**`
- `packages/player/**`
- `apps/desktop/src-tauri/**`

## Canonical UI Interfaces

后续任务只消费这些签名；不得为了还原 Gemini 原型添加可空“演示字段”。

```ts
// apps/desktop/src/presentation/media-presenters.ts
import type { MediaItem, MediaKind } from '@lumaroute/core'
import type { PlaybackPlan } from '@lumaroute/player'

export function mediaKindLabel(kind: MediaKind): string
export function progressPercent(
  item: Pick<MediaItem, 'playbackPositionSeconds' | 'runtimeSeconds'>,
): number | null
export function playbackPlanFacts(plan: PlaybackPlan): readonly string[]
```

```ts
// apps/desktop/src/presentation/line-presenters.ts
import type { ServerLine, ServerProfile } from '@lumaroute/core'

export function resolveLine(profile: ServerProfile | null, lineId: string | null): ServerLine | null
export function lineProtocol(line: ServerLine): 'HTTP' | 'HTTPS'
export function lineStateLabels(
  line: ServerLine,
  profile: ServerProfile,
  activeLineId: string | null,
): readonly string[]
```

```vue
<!-- apps/desktop/src/components/ContinueWatchingCard.vue -->
<script setup lang="ts">
import type { MediaItem } from '@lumaroute/core'

defineProps<{ item: MediaItem; profileId: string }>()
</script>
```

## Task 1: Aurora Design Tokens 与全局可访问性

**Files:**

- Create: `apps/desktop/src/styles.test.ts`
- Modify: `apps/desktop/src/styles.css`
- Modify: `apps/desktop/src/views/OnboardingView.vue`

**Interfaces:**

- Consumes: 现有 `lr-*` class 和 CSS custom properties。
- Produces: 深色 Aurora token、`.lr-glass-card`、统一 focus ring、毛玻璃降级和 reduced-motion 规则。

- [ ] **Step 1: 写失败的全局样式契约测试**

```ts
// apps/desktop/src/styles.test.ts
import { describe, expect, it } from 'vitest'
import styles from './styles.css?raw'

describe('Aurora global styles', () => {
  it('defines dark native-CSS tokens and glass fallback without Tailwind', () => {
    expect(styles).toContain('color-scheme: dark')
    expect(styles).toContain('--lr-bg-base: #080c14')
    expect(styles).toContain('--lr-accent-cyan: #06b6d4')
    expect(styles).toContain('.lr-glass-card')
    expect(styles).toContain('@supports ((backdrop-filter: blur(1px))')
    expect(styles).not.toContain('@tailwind')
  })

  it('disables decorative motion when the user requests reduced motion', () => {
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('animation-duration: 0.01ms')
  })
})
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm vitest run apps/desktop/src/styles.test.ts`

Expected: FAIL，缺少 `color-scheme: dark`、Aurora tokens、玻璃 class 和 reduced-motion 规则。

- [ ] **Step 3: 最小实现深色 token 与玻璃基础类**

将 `styles.css` 的根 token 替换为以下真实设计基础，并保留文件中已有 button/input/helper 规则，随后把其中旧 token 引用映射到新 token：

```css
:root {
  color-scheme: dark;
  font-family: 'Plus Jakarta Sans', 'PingFang SC', 'Segoe UI', sans-serif;
  line-height: 1.5;
  font-size: 14px;
  --lr-bg-base: #080c14;
  --lr-bg-canvas: #0d1322;
  --lr-surface-card: rgb(15 23 42 / 70%);
  --lr-surface-card-hover: rgb(30 41 59 / 85%);
  --lr-surface-active: rgb(15 28 50 / 90%);
  --lr-border-subtle: rgb(255 255 255 / 8%);
  --lr-border-hover: rgb(6 182 212 / 40%);
  --lr-accent-cyan: #06b6d4;
  --lr-accent-blue: #3b82f6;
  --lr-accent-emerald: #10b981;
  --lr-accent-amber: #f59e0b;
  --lr-accent-rose: #f43f5e;
  --lr-accent-purple: #8b5cf6;
  --lr-text-primary: #f8fafc;
  --lr-text-secondary: #94a3b8;
  --lr-text-muted: #64748b;
  --lr-canvas: var(--lr-bg-base);
  --lr-surface: var(--lr-bg-canvas);
  --lr-surface-muted: rgb(30 41 59 / 72%);
  --lr-surface-hover: rgb(30 41 59 / 88%);
  --lr-border: var(--lr-border-subtle);
  --lr-border-strong: rgb(255 255 255 / 16%);
  --lr-text: var(--lr-text-primary);
  --lr-text-tertiary: var(--lr-text-muted);
  --lr-accent: var(--lr-accent-cyan);
  --lr-accent-hover: #22d3ee;
  --lr-accent-soft: rgb(6 182 212 / 14%);
  --lr-danger: var(--lr-accent-rose);
  --lr-danger-soft: rgb(244 63 94 / 10%);
  --lr-success: var(--lr-accent-emerald);
  --lr-warning: var(--lr-accent-amber);
  --lr-radius-xs: 6px;
  --lr-radius-sm: 8px;
  --lr-radius-md: 12px;
  --lr-radius-lg: 16px;
  --lr-shadow: 0 10px 25px -8px rgb(0 0 0 / 45%);
  --lr-shadow-md: 0 16px 32px -10px rgb(0 0 0 / 52%);
  --lr-shadow-poster: 0 18px 38px -12px rgb(6 182 212 / 22%);
  --lr-focus-ring: 0 0 0 2px var(--lr-bg-base), 0 0 0 4px var(--lr-accent-cyan);
  --lr-ease: 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.lr-glass-card {
  background: var(--lr-surface-card);
  border: 1px solid var(--lr-border-subtle);
  border-radius: 1rem;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 8%),
    var(--lr-shadow);
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .lr-glass-card {
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

将 `OnboardingView.vue` 的根背景改为 Aurora 光晕，并把表单容器 class 改为 `onboarding lr-glass-card`；不改变输入字段、提交逻辑或结果文案。

- [ ] **Step 4: 运行样式与 Onboarding 回归**

Run: `pnpm vitest run apps/desktop/src/styles.test.ts apps/desktop/src/views/OnboardingView.test.ts apps/desktop/src/App.test.ts`

Expected: PASS；Onboarding 提交行为、密码清空和初始路由测试保持通过。

- [ ] **Step 5: 运行类型检查并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck`

Expected: PASS，无 Vue/TypeScript 错误。

```bash
git add apps/desktop/src/styles.css apps/desktop/src/styles.test.ts apps/desktop/src/views/OnboardingView.vue
git commit -m "style: establish accessible Aurora visual foundation"
```

## Task 2: 保留当前服务器语义的 Shell HUD

**Files:**

- Create: `apps/desktop/src/presentation/line-presenters.ts`
- Create: `apps/desktop/src/presentation/line-presenters.test.ts`
- Modify: `apps/desktop/src/components/AppShell.vue`
- Modify: `apps/desktop/src/components/AppShell.test.ts`
- Modify: `apps/desktop/src/components/ServerSwitcher.vue`
- Modify: `apps/desktop/src/components/LibrarySidebar.vue`

**Interfaces:**

- Consumes: `ServerProfile`, `mediaStore.activeLineId`, `mediaStore.connectionStatus(profileId)`。
- Produces: `resolveLine(...)`；`⌘K/Ctrl+K` 只聚焦现有当前服务器搜索框；HUD 只显示真实线路标签和 healthy/checking/unhealthy/unknown。

- [ ] **Step 1: 写失败的线路 presenter 与快捷键测试**

```ts
// apps/desktop/src/presentation/line-presenters.test.ts
import { describe, expect, it } from 'vitest'
import type { ServerProfile } from '@lumaroute/core'
import { lineProtocol, lineStateLabels, resolveLine } from './line-presenters'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'emby',
  serverId: 'server-1',
  userId: 'user-1',
  username: 'demo',
  credentialKey: 'credential-1',
  preferredLineId: 'line-1',
  lines: [
    { id: 'line-1', label: 'LAN', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
    { id: 'line-2', label: 'WAN', baseUrl: 'https://media.example', priority: 1, enabled: false },
  ],
}

describe('line presenters', () => {
  it('does not substitute preferred line when an unknown active id is supplied', () => {
    expect(resolveLine(profile, 'missing')).toBeNull()
    expect(resolveLine(profile, null)).toBeNull()
  })

  it('derives only facts represented by ServerLine', () => {
    expect(lineProtocol(profile.lines[0]!)).toBe('HTTP')
    expect(lineProtocol(profile.lines[1]!)).toBe('HTTPS')
    expect(lineStateLabels(profile.lines[1]!, profile, 'line-2')).toEqual(['当前线路', '已禁用'])
  })
})
```

在 `AppShell.test.ts` 现有 describe 中增加：

```ts
it('focuses current-server search on Ctrl+K without changing its scope', async () => {
  const { wrapper } = await mountPopulatedShell()
  const input = wrapper.get('[data-testid="current-server-search"]').element as HTMLInputElement
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
  expect(document.activeElement).toBe(input)
  expect(input.getAttribute('placeholder')).toBe('搜索当前服务器')
  wrapper.unmount()
})
```

将现有 mount setup 提取为 `mountPopulatedShell()`，复用当前 `profile/services/router`，且必须 `attachTo: document.body` 以验证焦点。

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm vitest run apps/desktop/src/presentation/line-presenters.test.ts apps/desktop/src/components/AppShell.test.ts`

Expected: FAIL，presenter 文件不存在，搜索框没有目标 `data-testid`，也没有快捷键监听。

- [ ] **Step 3: 实现纯展示线路函数**

```ts
// apps/desktop/src/presentation/line-presenters.ts
import type { ServerLine, ServerProfile } from '@lumaroute/core'

export function resolveLine(
  profile: ServerProfile | null,
  lineId: string | null,
): ServerLine | null {
  if (!profile || !lineId) return null
  return profile.lines.find((line) => line.id === lineId) ?? null
}

export function lineProtocol(line: ServerLine): 'HTTP' | 'HTTPS' {
  return new URL(line.baseUrl).protocol === 'https:' ? 'HTTPS' : 'HTTP'
}

export function lineStateLabels(
  line: ServerLine,
  profile: ServerProfile,
  activeLineId: string | null,
): readonly string[] {
  const labels: string[] = []
  if (line.id === activeLineId) labels.push('当前线路')
  if (line.id === profile.preferredLineId) labels.push('首选线路')
  if (!line.enabled) labels.push('已禁用')
  return labels
}
```

- [ ] **Step 4: 实现 HUD 与快捷键生命周期**

在 `AppShell.vue` 中加入：

```ts
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveLine } from '../presentation/line-presenters'

const searchInput = ref<HTMLInputElement | null>(null)
const activeLine = computed(() => resolveLine(activeProfile.value, mediaStore.activeLineId))

function onSearchShortcut(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
  event.preventDefault()
  searchInput.value?.focus()
}

onMounted(() => window.addEventListener('keydown', onSearchShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', onSearchShortcut))
```

搜索框保持现有 `onTopSearch`，模板只增加真实状态：

```vue
<div
  class="line-status-pill"
  :data-status="activeProfile ? mediaStore.connectionStatus(activeProfile.id) : 'unknown'"
>
  <span class="status-dot" aria-hidden="true" />
  <span>{{ activeLine?.label ?? '尚无活动线路' }}</span>
</div>
<input
  ref="searchInput"
  data-testid="current-server-search"
  type="search"
  role="searchbox"
  :value="topSearchTerm"
  placeholder="搜索当前服务器"
  autocomplete="off"
  @input="onTopSearch"
/>
```

只调整 `AppShell/ServerSwitcher/LibrarySidebar` scoped CSS 为玻璃侧栏、HUD 顶栏、胶囊状态和清晰选中态；不创建“收藏”“拓扑”路由，不移除现有 `data-testid`。

- [ ] **Step 5: 运行 Shell 与搜索回归**

Run: `pnpm vitest run apps/desktop/src/presentation/line-presenters.test.ts apps/desktop/src/components/AppShell.test.ts apps/desktop/src/components/ServerSwitcher.test.ts apps/desktop/src/components/LibrarySidebar.test.ts apps/desktop/src/views/SearchView.test.ts`

Expected: PASS；快捷键聚焦、服务器切换、媒体库状态和当前服务器搜索保持通过。

- [ ] **Step 6: 类型检查并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck`

Expected: PASS。

```bash
git add apps/desktop/src/presentation/line-presenters.ts apps/desktop/src/presentation/line-presenters.test.ts apps/desktop/src/components/AppShell.vue apps/desktop/src/components/AppShell.test.ts apps/desktop/src/components/ServerSwitcher.vue apps/desktop/src/components/LibrarySidebar.vue
git commit -m "feat: add factual shell HUD and search shortcut"
```

## Task 3: 真实数据驱动的 Home Bento

**Files:**

- Create: `apps/desktop/src/presentation/media-presenters.ts`
- Create: `apps/desktop/src/presentation/media-presenters.test.ts`
- Create: `apps/desktop/src/components/ContinueWatchingCard.vue`
- Create: `apps/desktop/src/components/ContinueWatchingCard.test.ts`
- Modify: `apps/desktop/src/views/HomeView.vue`
- Modify: `apps/desktop/src/views/HomeView.test.ts`

**Interfaces:**

- Consumes: `MediaItem.runtimeSeconds`, `MediaItem.playbackPositionSeconds`, `mediaStore.continueWatching`, `mediaStore.libraries`。
- Produces: `progressPercent()` 返回真实百分比或 `null`；Home Bento 不需要推荐/评分/Backdrop。

- [ ] **Step 1: 写失败的 presenter 与继续观看卡测试**

```ts
// apps/desktop/src/presentation/media-presenters.test.ts
import { describe, expect, it } from 'vitest'
import { progressPercent } from './media-presenters'

describe('media presenters', () => {
  it('clamps a real playback position to a display percentage', () => {
    expect(progressPercent({ playbackPositionSeconds: 90, runtimeSeconds: 120 })).toBe(75)
    expect(progressPercent({ playbackPositionSeconds: 150, runtimeSeconds: 120 })).toBe(100)
  })

  it('omits progress when runtime is unavailable or invalid', () => {
    expect(progressPercent({ playbackPositionSeconds: 20, runtimeSeconds: null })).toBeNull()
    expect(progressPercent({ playbackPositionSeconds: 20, runtimeSeconds: 0 })).toBeNull()
  })
})
```

```ts
// apps/desktop/src/components/ContinueWatchingCard.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ContinueWatchingCard from './ContinueWatchingCard.vue'

const item = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Arrival',
  overview: null,
  productionYear: 2016,
  runtimeSeconds: 120,
  parentId: null,
  seriesId: null,
  indexNumber: null,
  imageTag: null,
  playbackPositionSeconds: 90,
} as const

describe('ContinueWatchingCard', () => {
  it('renders progress computed from real media fields', () => {
    const wrapper = mount(ContinueWatchingCard, {
      props: { item, profileId: 'profile-1' },
      global: { stubs: { MediaCard: { template: '<div>Arrival</div>' } } },
    })
    expect(wrapper.get('progress').attributes('value')).toBe('75')
    expect(wrapper.get('[data-testid="continue-progress"]').text()).toBe('75%')
  })
})
```

在 `HomeView.test.ts` 的首个用例中增加：

```ts
expect(wrapper.find('[data-testid="spotlight-rating"]').exists()).toBe(false)
expect(wrapper.find('[data-testid="recommendations"]').exists()).toBe(false)
expect(wrapper.get('[data-testid="continue-progress"]').text()).toBe('2%')
expect(wrapper.get('[data-testid="library-bento-lib-1"]').text()).toContain('Movies')
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm vitest run apps/desktop/src/presentation/media-presenters.test.ts apps/desktop/src/components/ContinueWatchingCard.test.ts apps/desktop/src/views/HomeView.test.ts`

Expected: FAIL，新文件和 Home Bento selectors 不存在。

- [ ] **Step 3: 实现媒体展示函数和真实进度卡**

```ts
// apps/desktop/src/presentation/media-presenters.ts
import type { MediaItem, MediaKind } from '@lumaroute/core'
import type { PlaybackPlan } from '@lumaroute/player'

export function mediaKindLabel(kind: MediaKind): string {
  return { movie: '电影', series: '剧集', season: '季', episode: '单集' }[kind]
}

export function progressPercent(
  item: Pick<MediaItem, 'playbackPositionSeconds' | 'runtimeSeconds'>,
): number | null {
  if (item.runtimeSeconds == null || item.runtimeSeconds <= 0) return null
  return Math.min(
    100,
    Math.max(0, Math.round((item.playbackPositionSeconds / item.runtimeSeconds) * 100)),
  )
}

export function playbackPlanFacts(plan: PlaybackPlan): readonly string[] {
  const facts = [
    plan.method === 'direct-play' ? '原文件直放' : '直接串流',
    plan.container.toUpperCase(),
    plan.videoCodec.toUpperCase(),
  ]
  if (plan.audioCodec) facts.push(plan.audioCodec.toUpperCase())
  if (plan.bitrate != null) facts.push(`${(plan.bitrate / 1_000_000).toFixed(1)} Mbps`)
  return facts
}
```

```vue
<!-- apps/desktop/src/components/ContinueWatchingCard.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { MediaItem } from '@lumaroute/core'
import { progressPercent } from '../presentation/media-presenters'
import MediaCard from './MediaCard.vue'

const props = defineProps<{ item: MediaItem; profileId: string }>()
const percent = computed(() => progressPercent(props.item))
</script>

<template>
  <article class="continue-card">
    <MediaCard :item="item" :profile-id="profileId" />
    <div v-if="percent != null" class="progress-row">
      <progress :value="percent" max="100" :aria-label="`${item.name} 已播放 ${percent}%`" />
      <span data-testid="continue-progress">{{ percent }}%</span>
    </div>
  </article>
</template>
```

- [ ] **Step 4: 把首页重排为只依赖真实数据的 Bento**

`HomeView.vue` 使用三块区域：

```vue
<div class="home-bento">
  <section class="lr-glass-card line-card" aria-labelledby="line-heading">
    <h2 id="line-heading">当前连接</h2>
    <p>{{ activeLineLabel ?? '尚无活动线路' }}</p>
    <p class="lr-muted">连接状态：{{ connectionLabel }}</p>
  </section>

  <section class="lr-glass-card continue-panel" aria-labelledby="continue-watching-heading">
    <h2 id="continue-watching-heading">继续观看</h2>
    <div v-if="mediaStore.continueWatching.length" class="shelf">
      <ContinueWatchingCard
        v-for="entry in mediaStore.continueWatching"
        :key="entry.id"
        :item="entry"
        :profile-id="activeServerId!"
      />
    </div>
    <p v-else class="lr-muted" data-testid="home-continue-empty">暂无继续观看的内容。</p>
  </section>
  <section class="library-bento" aria-labelledby="libraries-heading">
    <h2 id="libraries-heading">媒体库</h2>
    <RouterLink
      v-for="library in mediaStore.libraries"
      :key="library.id"
      :data-testid="`library-bento-${library.id}`"
      :to="`/library/${library.id}`"
      class="lr-glass-card library-entry"
    >
      <span>{{ library.name }}</span>
      <span class="lr-muted">{{ library.collectionType ?? '媒体库' }}</span>
    </RouterLink>
  </section>
</div>
```

`activeLineLabel` 必须由 `resolveLine(activeProfile, mediaStore.activeLineId)` 得到；`connectionLabel` 只映射 `healthy/checking/unhealthy/unknown`，不生成延迟值。

- [ ] **Step 5: 运行 Home 和 presenter 测试**

Run: `pnpm vitest run apps/desktop/src/presentation/media-presenters.test.ts apps/desktop/src/components/ContinueWatchingCard.test.ts apps/desktop/src/views/HomeView.test.ts apps/desktop/src/components/AppShell.test.ts`

Expected: PASS；真实进度为 `2%`（120/7200），无评分或推荐节点。

- [ ] **Step 6: 类型检查并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck`

Expected: PASS。

```bash
git add apps/desktop/src/presentation/media-presenters.ts apps/desktop/src/presentation/media-presenters.test.ts apps/desktop/src/components/ContinueWatchingCard.vue apps/desktop/src/components/ContinueWatchingCard.test.ts apps/desktop/src/views/HomeView.vue apps/desktop/src/views/HomeView.test.ts
git commit -m "feat: build Home Bento from existing media facts"
```

## Task 4: 响应式虚拟海报墙与真实媒体卡

**Files:**

- Modify: `apps/desktop/src/components/VirtualPosterGrid.vue`
- Modify: `apps/desktop/src/components/VirtualPosterGrid.test.ts`
- Modify: `apps/desktop/src/components/MediaCard.vue`
- Modify: `apps/desktop/src/views/LibraryView.vue`
- Modify: `apps/desktop/src/views/SearchView.vue`

**Interfaces:**

- Consumes: `VirtualPosterGrid` 现有 props/events、`MediaItem.name/productionYear/kind/imageTag`。
- Produces: 最大 6 列、窄窗口最小 1 列的虚拟网格；卡片只显示真实年份和 kind，不显示评分、收藏或 4K。

- [ ] **Step 1: 写失败的列数上限与媒体卡事实测试**

在 `VirtualPosterGrid.test.ts` 增加：

```ts
it('caps a very wide viewport at six virtualized columns', async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 2400,
  })
  const wrapper = mountGrid({ itemCount: 24 })
  await nextTick()
  await nextTick()
  expect(wrapper.get('[data-row-index="0"]').attributes('style')).toMatch(/repeat\(6/)
  expect(wrapper.get('[data-row-index="0"]').findAll('[data-testid="media-card"]')).toHaveLength(6)
})
```

在同文件增加真实 `MediaCard` mount 测试（不 stub）：

```ts
it('renders only media facts that exist on MediaItem', () => {
  const wrapper = mount(MediaCard, {
    props: { item: movie, profileId: 'profile-1' },
    global: {
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
      provide: { [servicesKey as symbol]: { images: { load: vi.fn(), release: vi.fn() } } },
    },
  })
  expect(wrapper.text()).toContain('2016')
  expect(wrapper.text()).toContain('电影')
  expect(wrapper.find('[data-testid="rating"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="favorite"]').exists()).toBe(false)
})
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm vitest run apps/desktop/src/components/VirtualPosterGrid.test.ts`

Expected: FAIL，超宽布局超过 6 列，卡片尚未显示 kind。

- [ ] **Step 3: 最小修改列数和卡片元数据**

```ts
// VirtualPosterGrid.vue
const columnCount = computed(() => {
  const width = Math.max(containerWidth.value, 1)
  return Math.min(6, Math.max(1, Math.floor((width + GAP) / (props.columnMinWidth + GAP))))
})
```

`MediaCard.vue` 使用 Task 3 的 `mediaKindLabel`：

```ts
const metaLine = computed(() =>
  [props.item.productionYear, mediaKindLabel(props.item.kind)]
    .filter((value) => value != null)
    .join(' · '),
)
```

```vue
<div class="poster-wrap">
  <!-- 保持现有 useSecureImage 产生的 Blob URL 图片或占位 -->
  <span class="kind-chip">{{ mediaKindLabel(item.kind) }}</span>
</div>
<span class="title" :title="item.name">{{ item.name }}</span>
<span v-if="metaLine" class="meta">{{ metaLine }}</span>
```

CSS 保持 `aspect-ratio: 2 / 3`，增加玻璃 kind chip、`translateY(-4px)` hover、focus-visible 和 150–250ms 过渡；不得加入点击播放按钮，因为 `series` 卡没有直接播放语义。

- [ ] **Step 4: 收敛 Library/Search 容器视觉**

只改 `LibraryView.vue` 与 `SearchView.vue` scoped CSS 和标题结构，让结果区使用全宽、真实结果数和统一空态；保留 `useLibraryItems`、`VirtualPosterGrid`、分页和 250ms 当前服务器搜索逻辑。

- [ ] **Step 5: 运行网格、列表和搜索测试**

Run: `pnpm vitest run apps/desktop/src/components/VirtualPosterGrid.test.ts apps/desktop/src/views/LibraryView.test.ts apps/desktop/src/views/SearchView.test.ts apps/desktop/src/platform/images/secure-image-loader.test.ts`

Expected: PASS；10,000 项 DOM 节点仍 `<=150`，触底只请求一次下一页，图片安全测试保持通过。

- [ ] **Step 6: 类型检查并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck`

Expected: PASS。

```bash
git add apps/desktop/src/components/VirtualPosterGrid.vue apps/desktop/src/components/VirtualPosterGrid.test.ts apps/desktop/src/components/MediaCard.vue apps/desktop/src/views/LibraryView.vue apps/desktop/src/views/SearchView.vue
git commit -m "style: refine virtual poster wall with factual metadata"
```

## Task 5: 无假 Backdrop 的沉浸详情与 Episode Deck

**Files:**

- Modify: `apps/desktop/src/views/MediaDetailView.vue`
- Modify: `apps/desktop/src/views/MediaDetailView.test.ts`

**Interfaces:**

- Consumes: Primary `posterSource`、`MediaItem` 现有字段、真实 seasons/episodes。
- Produces: CSS Aurora hero、真实最小详情、季/集 Deck；不请求 Backdrop，不显示评分/收藏/预播放 codec。

- [ ] **Step 1: 写失败的详情范围测试**

在 `MediaDetailView.test.ts` 增加：

```ts
it('builds an immersive layout without claiming unavailable media facts', async () => {
  const { wrapper } = mountDetail({ itemId: movie.id })
  await flushPromises()
  expect(wrapper.get('[data-testid="detail-hero"]').classes()).toContain('aurora-hero')
  expect(wrapper.get('[data-testid="detail-poster"]').attributes('src') ?? '').not.toContain(
    'Backdrop',
  )
  expect(wrapper.find('[data-testid="rating"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="favorite"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="technical-specs"]').exists()).toBe(false)
})

it('renders selected season episodes as a real episode deck', async () => {
  const { wrapper } = mountSeriesDetail()
  await flushPromises()
  await wrapper.get('[data-season-id="season-1"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="episode-deck"]').text()).toContain('E01')
  expect(wrapper.get('[data-testid="episode-deck"]').text()).toContain('Dulcinea')
})
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm vitest run apps/desktop/src/views/MediaDetailView.test.ts`

Expected: FAIL，缺少 `detail-hero` selector、`aurora-hero` class 和 `episode-deck` selector。

- [ ] **Step 3: 最小实现沉浸结构**

将现有详情 hero 标记和元数据改为：

```vue
<div data-testid="detail-hero" class="detail-hero aurora-hero">
  <div class="hero-glow" aria-hidden="true" />
  <div class="poster-panel">
    <img
      v-if="posterSource"
      class="poster"
      data-testid="detail-poster"
      :src="posterSource"
      :alt="item.name"
    >
    <div v-else class="poster poster-placeholder" data-testid="detail-poster" aria-hidden="true" />
  </div>
  <div class="detail-main">
    <p class="eyebrow">{{ mediaKindLabel(item.kind) }}</p>
    <h1>{{ item.name }}</h1>
    <p class="meta-line">
      <span v-if="item.productionYear != null">{{ item.productionYear }}</span>
      <span v-if="item.runtimeSeconds != null"> · {{ formatRuntime(item.runtimeSeconds) }}</span>
    </p>
    <div v-if="item.kind === 'movie' || item.kind === 'episode'" class="actions">
      <!-- 保留现有 play/resume buttons 和 handlers -->
    </div>
    <p v-if="item.overview" class="overview">{{ item.overview }}</p>
  </div>
</div>
```

`hero-glow` 只能是 CSS radial gradients，不能把 Primary 海报放大冒充 Backdrop。

- [ ] **Step 4: 最小实现真实 Episode Deck**

保留 `selectSeason()` 和现有请求，模板改为：

```vue
<section v-if="item.kind === 'series'" class="series-nav lr-glass-card" aria-label="季与剧集">
  <div class="deck-heading">
    <h2>选集</h2>
    <span class="lr-muted">{{ episodes.length ? `当前季 ${episodes.length} 集` : '请选择季' }}</span>
  </div>
  <ul class="season-list">
    <!-- 保留现有 season buttons、data-season-id 和 aria-pressed -->
  </ul>
  <ul v-if="episodes.length" class="episode-deck" data-testid="episode-deck">
    <li v-for="episode in episodes" :key="episode.id">
      <RouterLink :to="`/media/${episode.id}`" class="episode-chip">
        <span v-if="episode.indexNumber != null">E{{ String(episode.indexNumber).padStart(2, '0') }}</span>
        <span>{{ episode.name }}</span>
      </RouterLink>
    </li>
  </ul>
</section>
```

- [ ] **Step 5: 运行详情与图片安全测试**

Run: `pnpm vitest run apps/desktop/src/views/MediaDetailView.test.ts apps/desktop/src/platform/images/secure-image-loader.test.ts apps/desktop/src/queries`

Expected: PASS；播放/续播参数仍分别为 `0` 和保存位置，季/集请求保持原签名。

- [ ] **Step 6: 类型检查并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck`

Expected: PASS。

```bash
git add apps/desktop/src/views/MediaDetailView.vue apps/desktop/src/views/MediaDetailView.test.ts
git commit -m "style: add factual immersive detail workspace"
```

## Task 6: 真实状态的线路节点卡与诊断反馈

**Files:**

- Modify: `apps/desktop/src/router/index.ts`
- Modify: `apps/desktop/src/views/ServerSettingsView.vue`
- Modify: `apps/desktop/src/views/ServerSettingsView.test.ts`
- Modify: `apps/desktop/src/components/LineEditor.vue`
- Modify: `apps/desktop/src/components/LineStatus.vue`
- Modify: `apps/desktop/src/components/DiagnosticPanel.vue`

**Interfaces:**

- Consumes: `mediaStore.activeLineId`、Task 2 `lineProtocol/lineStateLabels`、现有 line CRUD callbacks。
- Produces: 当前/首选不混淆的节点卡、HTTP/HTTPS 标签、添加线路的真实验证结果、复制成功反馈。

- [ ] **Step 1: 写失败的线路事实与复制反馈测试**

在 `ServerSettingsView.test.ts` 增加：

```ts
it('renders only stored and session-derived line facts', () => {
  const { wrapper } = mountSettings({
    profiles: [profileOne],
    activeServerId: 'profile-1',
    activeLineId: 'line-2',
  })
  const lan = wrapper.get('[data-testid="line-item-line-1"]')
  const wan = wrapper.get('[data-testid="line-item-line-2"]')
  expect(lan.text()).toContain('HTTP')
  expect(lan.text()).toContain('首选线路')
  expect(lan.text()).not.toContain('当前线路')
  expect(wan.text()).toContain('HTTPS')
  expect(wan.text()).toContain('当前线路')
  expect(wrapper.text()).not.toMatch(/\d+ms|丢包|QUIC|gRPC/)
})
```

扩展 `mountSettings` options/props 使 `activeLineId` 可显式传入：

```ts
activeLineId: options.activeLineId ?? activeProfile.preferredLineId,
```

为 `DiagnosticPanel` 增加测试：

```ts
it('announces successful diagnostic copy only after the callback resolves', async () => {
  const copyReport = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(DiagnosticPanel, { props: { report: 'safe', copyReport } })
  await wrapper.get('[data-testid="copy-diagnostics"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[role="status"]').text()).toBe('诊断信息已复制')
})
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm vitest run apps/desktop/src/views/ServerSettingsView.test.ts apps/desktop/src/components/DiagnosticPanel.test.ts`

Expected: FAIL，节点卡没有协议/状态标签，`DiagnosticPanel` 没有复制成功状态。

- [ ] **Step 3: 把真实活动线路传给设置页**

在 `router/index.ts` 的 `settingsProps()` 中读取 media store：

```ts
const mediaStore = useMediaStore()
// ...
activeLineId:
  mediaStore.activeLineId &&
  profile?.lines.some((line) => line.id === mediaStore.activeLineId)
    ? mediaStore.activeLineId
    : null,
```

不要 fallback 到 `preferredLineId`；没有真实会话结果时节点只显示“首选线路”。

- [ ] **Step 4: 实现线路节点卡**

在 `ServerSettingsView.vue` 导入 Task 2 presenter，并替换 line row 的信息区：

```vue
<li
  v-for="line in sortedLines"
  :key="line.id"
  class="line-node lr-glass-card"
  :data-testid="`line-item-${line.id}`"
>
  <div class="line-node-head">
    <strong>{{ line.label }}</strong>
    <span class="protocol-chip">{{ lineProtocol(line) }}</span>
  </div>
  <span class="line-url lr-muted">{{ line.baseUrl }}</span>
  <div class="state-chips">
    <span v-for="label in lineStateLabels(line, profile, activeLineId)" :key="label">
      {{ label }}
    </span>
  </div>
  <div class="line-actions">
    <!-- 保留现有启停、上下移动、设为首选、敏感地址操作及 data-testid -->
  </div>
</li>
```

`LineEditor` 和 `LineStatus` 只改成节点添加区/扫描动画视觉；动画仅绑定已有 `testing` 状态。不得添加批量测速按钮。

- [ ] **Step 5: 实现复制成功的可访问反馈**

```ts
// DiagnosticPanel.vue <script setup>
import { computed, ref } from 'vue'
const copyStatus = ref<string | null>(null)

async function onCopy(): Promise<void> {
  copyStatus.value = null
  if (props.copyReport) await props.copyReport()
  else if (globalThis.navigator?.clipboard?.writeText)
    await globalThis.navigator.clipboard.writeText(props.report)
  copyStatus.value = '诊断信息已复制'
}
```

```vue
<p v-if="copyStatus" role="status" class="copy-status">{{ copyStatus }}</p>
```

- [ ] **Step 6: 运行设置、线路和诊断测试**

Run: `pnpm vitest run apps/desktop/src/views/ServerSettingsView.test.ts apps/desktop/src/components/DiagnosticPanel.test.ts apps/desktop/src/stores/server-store.test.ts`

Expected: PASS；ServerId mismatch 仍不保存，手动首选仍调用 `setPreferredLine(profileId, lineId)`。

- [ ] **Step 7: 类型检查并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck`

Expected: PASS。

```bash
git add apps/desktop/src/router/index.ts apps/desktop/src/views/ServerSettingsView.vue apps/desktop/src/views/ServerSettingsView.test.ts apps/desktop/src/components/LineEditor.vue apps/desktop/src/components/LineStatus.vue apps/desktop/src/components/DiagnosticPanel.vue apps/desktop/src/components/DiagnosticPanel.test.ts
git commit -m "feat: present factual route nodes and copy feedback"
```

## Task 7: 现有 v0.1 契约上的播放器 HUD

**Files:**

- Modify: `apps/desktop/src/components/PlayerControls.vue`
- Create: `apps/desktop/src/components/PlayerControls.test.ts`
- Modify: `apps/desktop/src/presentation/media-presenters.test.ts`

**Interfaces:**

- Consumes: `playerStore.state/positionSeconds/durationSeconds/activePlan/activeLineId`、`playbackPlanFacts()`。
- Produces: 毛玻璃 HUD、真实播放进度和播放后技术事实；仍只提供 pause/resume/seek/stop。

- [ ] **Step 1: 写失败的播放计划展示与控件范围测试**

在 `media-presenters.test.ts` 增加：

```ts
it('formats only facts present in a playback plan', () => {
  expect(
    playbackPlanFacts({
      itemId: 'item-1',
      mediaSourceId: 'source-1',
      playSessionId: 'session-1',
      streamUrl: 'https://media.example/stream',
      requestHeaders: {},
      container: 'mkv',
      videoCodec: 'hevc',
      audioCodec: 'aac',
      bitrate: 8_000_000,
      durationSeconds: 120,
      method: 'direct-play',
      startPositionSeconds: 0,
    }),
  ).toEqual(['原文件直放', 'MKV', 'HEVC', 'AAC', '8.0 Mbps'])
})
```

```ts
// apps/desktop/src/components/PlayerControls.test.ts
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import PlayerControls from './PlayerControls.vue'
import { usePlayerStore } from '../stores/player-store'

describe('PlayerControls', () => {
  it('shows active-plan facts but no unimplemented v0.2 controls', () => {
    const services = {
      player: {
        pause: vi.fn(),
        resume: vi.fn(),
        seek: vi.fn(),
        stop: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      },
      progressReporter: { handle: vi.fn() },
    } as unknown as AppServices
    const app = createApp({})
    const pinia = createPinia()
    app.use(pinia)
    app.provide(servicesKey, services)
    setActivePinia(pinia)
    let wrapper!: VueWrapper
    app.runWithContext(() => {
      const store = usePlayerStore()
      store.state = 'playing'
      store.positionSeconds = 12
      store.durationSeconds = 120
      store.activeLineId = 'line-1'
      store.activePlan = {
        itemId: 'item-1',
        mediaSourceId: 'source-1',
        playSessionId: 'session-1',
        streamUrl: 'https://media.example/stream',
        requestHeaders: {},
        container: 'mkv',
        videoCodec: 'hevc',
        audioCodec: 'aac',
        bitrate: 8_000_000,
        durationSeconds: 120,
        method: 'direct-play',
        startPositionSeconds: 0,
      }
      wrapper = mount(PlayerControls, {
        global: {
          plugins: [pinia],
          provide: { [servicesKey as symbol]: services },
        },
      })
    })
    expect(wrapper.get('[data-testid="playback-facts"]').text()).toContain('8.0 Mbps')
    expect(wrapper.find('[data-testid="volume"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="audio-tracks"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="subtitles"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fullscreen"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm vitest run apps/desktop/src/presentation/media-presenters.test.ts apps/desktop/src/components/PlayerControls.test.ts`

Expected: FAIL，HUD 没有 `playback-facts`。

- [ ] **Step 3: 实现仅基于 activePlan 的技术事实**

在 `PlayerControls.vue` 加入：

```ts
import { computed } from 'vue'
import { playbackPlanFacts } from '../presentation/media-presenters'

const planFacts = computed(() =>
  playerStore.activePlan ? playbackPlanFacts(playerStore.activePlan) : [],
)
```

```vue
<div class="player-controls lr-glass-card" data-testid="player-controls" :data-state="playerStore.state">
  <div class="hud-top">
    <p data-testid="player-state">{{ localizedState }}</p>
    <div v-if="planFacts.length" data-testid="playback-facts" class="fact-chips">
      <span v-for="fact in planFacts" :key="fact">{{ fact }}</span>
      <span v-if="playerStore.activeLineId">线路 {{ playerStore.activeLineId }}</span>
    </div>
  </div>
  <div class="timeline">
    <span>{{ formatClock(playerStore.positionSeconds) }}</span>
    <input
      data-testid="player-seek"
      type="range"
      min="0"
      :max="Math.max(playerStore.durationSeconds, 0)"
      :value="playerStore.positionSeconds"
      @change="onSeek"
    >
    <span>{{ formatClock(playerStore.durationSeconds) }}</span>
  </div>
  <div class="actions">
    <!-- 保留现有 pause/resume/stop buttons 和 handlers -->
  </div>
</div>
```

不要添加码率实时刷新、缓冲条、±10 秒、音量、倍速、全屏、音轨、字幕或章节按钮。

- [ ] **Step 4: 运行播放器组件、store 与进度回归**

Run: `pnpm vitest run apps/desktop/src/presentation/media-presenters.test.ts apps/desktop/src/components/PlayerControls.test.ts apps/desktop/src/stores/player-store.test.ts packages/core/src/playback/progress-reporter.test.ts`

Expected: PASS；播放计划字段真实显示，进度上报行为不变。

- [ ] **Step 5: 类型检查并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck`

Expected: PASS。

```bash
git add apps/desktop/src/components/PlayerControls.vue apps/desktop/src/components/PlayerControls.test.ts apps/desktop/src/presentation/media-presenters.test.ts
git commit -m "style: surface real playback facts in v0.1 HUD"
```

## Task 8: 端到端范围与安全回归

**Files:**

- Modify: `tests/e2e/browse-search-play.spec.ts`

**Interfaces:**

- Consumes: Task 2 快捷键、Task 3 真实进度、现有浏览/搜索/播放 E2E。
- Produces: 自动化证明搜索仍限当前服务器、图片 URL 不含 Token、播放闭环保持有效。

- [ ] **Step 1: 扩展 E2E 验收**

```ts
// tests/e2e/browse-search-play.spec.ts
test('uses the Aurora shell without widening current-server scope', async ({
  page,
  seedAuthenticatedProfiles,
}) => {
  await seedAuthenticatedProfiles(page)

  await page.keyboard.press('Control+K')
  const search = page.getByTestId('current-server-search')
  await expect(search).toBeFocused()
  await expect(search).toHaveAttribute('placeholder', '搜索当前服务器')

  await page.getByTestId('library-movies').click()
  await expect(page.getByTestId('media-card').first()).toBeVisible()
  const posterSources = await page
    .locator('[data-testid="media-card"] img')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src') ?? ''))
  expect(posterSources.every((source) => source === '' || source.startsWith('blob:'))).toBe(true)
  expect(posterSources.join(' ')).not.toMatch(/token|api_key|X-Emby-Token/i)
})
```

保留原有 browse/search/play/progress 测试，不用截图断言替代行为断言。

- [ ] **Step 2: 运行 UI 单测和 E2E**

Run: `pnpm vitest run apps/desktop/src`

Expected: PASS，全部 desktop 测试通过。

Run: `pnpm test:e2e -- tests/e2e/browse-search-play.spec.ts tests/e2e/onboarding.spec.ts`

Expected: PASS；添加服务器、浏览、当前服务器搜索、播放和 12 秒进度上报均通过。

- [ ] **Step 3: 运行完整质量门**

Run: `pnpm check`

Expected: PASS；ESLint 0 warnings、TypeScript 全 workspace 通过、Vitest/Rust/boundary/sensitive/mpv checks 全部通过。

Run: `git diff --check`

Expected: 无输出，退出码 0。

- [ ] **Step 4: 人工实机验收（不替代自动化）**

Run: `pnpm dev`

Expected:

- 深色画布、玻璃表面和文字对比在 macOS/Windows 窗口中可读。
- `⌘K`（macOS）与 `Ctrl+K`（Windows/Linux）聚焦当前服务器搜索。
- 窗口缩放时海报墙在 1–6 列之间变化，滚动与分页无明显跳动。
- 无 Backdrop 时详情仍有完整 Aurora hero，不出现破图或假规格。
- 设置页只显示 HTTP/HTTPS、当前/首选/禁用和真实验证结果，不出现延迟、丢包、QUIC/gRPC。
- 独立 mpv 窗口行为不变；WebView HUD 只控制现有 v0.1 能力。

- [ ] **Step 5: 提交验收测试**

```bash
git add tests/e2e/browse-search-play.spec.ts
git commit -m "test: lock factual Aurora UI acceptance"
```

## Deferred Work Packages（必须先修订 spec，不属于 Task）

### A. 媒体展示数据扩展

若要实现评分、收藏、Backdrop、genres、分辨率/HDR/声道、推荐和最新媒体，需要先在独立 spec 中定义：

- `MediaItem` 哪些字段跨 Emby/Jellyfin 可稳定归一化，哪些允许 `null`。
- 收藏读写 API、失败/冲突语义和缓存失效。
- Primary/Backdrop 等图片 kind 与 tag 的安全加载接口，不能把 Token 放进 URL。
- 推荐/最新的服务端查询语义；不能用“continue watching 第一项”冒充 Spotlight 推荐。
- DTO mapper、adapter contract、fixture 和 core tests，再由 UI 消费。

### B. 线路遥测与拓扑

若要实现延迟、丢包、吞吐或全链路测速，需要先定义：

- `LineProbeResult` 的测量目标、超时、采样数、时间戳和误差语义。
- HTTP 请求延迟与 ICMP/UDP 丢包的区别；桌面权限与跨平台可行性。
- 测速流量上限、用户触发/后台频率、取消与并发策略。
- QUIC/gRPC 只有实际传输栈支持时才能显示；不能从 URL 或 marketing label 推断。
- 结果是瞬时状态还是持久化历史，以及敏感 URL 的脱敏规则。

### C. v0.2 Player Basics

按 `2026-08-21-lumaroute-v0.2-player-basics-design.md` 另写跨 `packages/player`、desktop store、Tauri/Rust 和 fake mpv 的实施计划；先满足 v0.1 Internal Alpha 门禁。倍速和缓冲预览不在该 spec，若需要必须再次修订。

### D. 跨服与个人媒体能力

“全局搜索”“聚合首页”“收藏夹”改变 v0.1 §4 范围。必须分别定义跨服查询隔离、结果去重/来源标识、凭证错误隔离、收藏归属和跨服务器一致性；本 UI 计划不预留假路由或空 store。

## Plan Author Self-Review Record

- **Spec coverage:** UI spec 的纯视觉、现有搜索、真实 continue watching、虚拟海报墙、最小详情、线路管理和 v0.1 HUD 均有任务；其余逐项进入 blocker/deferred packages。
- **No fake data:** 计划没有社区评分、收藏状态、推荐、Backdrop、延迟、丢包、吞吐、QUIC/gRPC、HDR/Atmos 或未实现播放器状态的占位字段。
- **Architecture:** 可执行任务只触及 `apps/desktop` 和 E2E；不修改 core/player/Rust 契约。
- **Dependency audit:** `apps/desktop/package.json` 不变；没有 Tailwind、UI kit、图标包、字体包或 `@pinia/testing` 新依赖。
- **Type consistency:** `MediaItem`、`ServerLine`、`ServerProfile`、`PlaybackPlan` 与当前源码字段一致；active line 与 preferred line 明确分离。
- **Security:** 所有图片继续走 `useSecureImage`；E2E 检查 Blob URL 与敏感参数。
- **TDD:** 每个行为任务都有明确红灯、最小实现、绿灯命令和预期结果；纯 CSS 有 raw 文本契约测试。
- **Scope note:** Task 1–8 覆盖修订后 UI spec 的当前阶段验收；`Deferred Work Packages` 与 spec §7 一致，不能把后续独立设计能力记为完成。
