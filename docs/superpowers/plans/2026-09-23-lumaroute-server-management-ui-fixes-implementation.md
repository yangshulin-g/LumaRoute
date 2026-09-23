# LumaRoute 服务器管理补完与 UI 修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不扩大 v0.1 范围的前提下，补齐主界面添加服务器与凭证失效后重新登录，并修正搜索双输入、线路英文默认名、首页重复线路和无服务器占位 Profile 四个 UI 问题。

**Architecture:** 唯一的 core 变更是 `LoginService`（`addServer` 可选 `lineLabel`、新增 `reauthenticate`）与 `AppErrorCode` 增量 `UserMismatch`；`reauthenticate` 复用 `orderLines`/`canFailOver`，不经过 `RouteExecutor`（不写粘滞线路）。桌面端仍由页面 → Pinia store → core 服务调用，路由负责无服务器守卫与引导页添加模式；E2E mock 服务端增加 Token/密码校验以模拟服务端改密。

**Tech Stack:** Vue 3.5、TypeScript 5.9（`exactOptionalPropertyTypes`）、Pinia 4、Vue Router 5、Vitest 4 + happy-dom + Vue Test Utils 2、Playwright；不新增任何依赖，不改 Rust。

**Design source:** `docs/superpowers/specs/2026-09-23-lumaroute-server-management-ui-fixes-design.md`（已批准，2026-09-23）。

## Global Constraints

- 产品/架构事实以 `docs/superpowers/specs/2026-08-07-lumaroute-v0.1-design.md` 为准；本阶段范围以上述已批准设计为准，不做首页数据增强、客户端改密或更换用户。
- `packages/core` 不导入 Vue、Pinia、Tauri 或 desktop（`pnpm check:boundaries` 强制）；`packages/player` 与 `apps/desktop/src-tauri/**` 不修改。
- 不新增 npm/cargo 依赖；`package.json`、`pnpm-lock.yaml`、`Cargo.toml` 不变。
- 页面只调用 store / 路由注入的回调，不直接访问 `services.login`、SQLite、凭证或 HTTP。
- 密码只存在于提交期间的组件局部状态与认证调用参数中，提交后立即清空；Token 只经 `CredentialStore.set` 写入系统安全存储，不进入 SQLite、URL、日志、测试夹具、DOM 或快照。
- 重新登录只访问 Profile 已配置且启用的线路，不接受新 URL，不允许修改用户名。
- 默认线路名：「主线路」（去空白后为空时使用；不再写入英文 `Primary`；已有 `Primary` 数据不迁移）。
- 引导页可选字段：标签「线路名称」，占位「主线路」。
- `UserMismatch` 中文提示（逐字）：「该账号不是此服务器配置的用户。如需使用其他账号，请作为新服务器添加。」
- 搜索无关键词空态（逐字）：「在顶部搜索框输入关键词（⌘K / Ctrl+K）」；有关键词标题：「搜索「{q}」· {N} 条（当前服务器）」；零结果空态保留「当前服务器没有匹配的结果。」与 `data-testid="search-no-results"`。
- 顶栏 `data-testid="current-server-search"` 是唯一搜索输入；`⌘K/Ctrl+K`、250ms 防抖、切服取消与结果仅限当前服务器不变。
- 侧栏添加入口：`data-testid="add-server"`、`aria-label="添加服务器"`；两个添加入口都进入路由 `/onboarding?mode=add`。
- 重新登录成功提示（逐字）：「已重新登录」；动作文案「重新登录」，表单按钮「登录」「取消」。
- 保留全部现有 `data-testid`，仅以下元素按设计删除：`HomeView` 的 `data-testid="active-line"`（连同「当前连接」卡片）、`SearchView` 自身的 `input[name="search"]` 与其 `data-testid="active-line"` 行。`LibraryView`、`ServerSettingsView` 的 `active-line` 保留。
- 所有行为变更先写失败测试并确认红灯，再最小实现并确认绿灯。
- 单测命令必须带 workspace 配置：`pnpm vitest run --config vitest.workspace.ts <paths>`（裸 `pnpm vitest run` 无法加载 `.vue`）。
- 每个任务结束运行：该任务测试 → `pnpm --filter @lumaroute/desktop typecheck` → `pnpm check`（ESLint 0 warning、全 workspace typecheck、Vitest、Rust、boundaries、sensitive、mpv）→ `git diff --check`。最终任务再运行 `pnpm exec playwright test`。
- `.vue` 中若新用到未列出的 DOM 全局（ESLint `no-undef`），在 `eslint.config.mjs` 的 `**/*.vue` globals 中补齐，而不是关闭规则。
- 本计划中的 commit 命令只供未来实施会话执行；编写本计划的会话不提交。

---

## 事实审计（编写计划时的代码现状）

- `LoginService.addServer` 固定写入 `label: 'Primary'`；没有 `reauthenticate`；`AppErrorCode` 无 `UserMismatch`（`packages/core/src/errors/app-error.ts`）。
- `orderLines(profile, stickyLineId)` 只返回启用线路（首选优先，其次 `priority`）；`canFailOver` 仅对 `NetworkUnavailable`、`LineTimeout`、HTTP `502/503/504` 返回 `true`。适配器把认证接口 `401/403` 映射为 `AuthenticationExpired`。
- 中文错误映射在 `apps/desktop/src/stores/server-connection-status.ts#connectionErrorMessage`；引导页映射 `views/onboarding-error-message.ts` 为英文；core `userActionFor` 只有 `switch line / sign in again / copy diagnostics`。脱敏：`packages/core/src/logging/redact.ts`（`password/token/...` 键）与 `scripts/check-sensitive-output.mjs`。
- `SearchView` 同时渲染自身 `input[name="search"]`、`data-testid="active-line"` 与顶栏输入；`HomeView` 有「当前连接」卡片（`active-line`）。
- `settingsProps()` 在无 Profile 时构造 `id: 'missing'` 占位 Profile；路由没有无服务器守卫，只有 `main.ts` 启动时一次性跳转。
- 引导页仅在首次启动可达，无取消；`ServerSwitcher` 只有选择/重试；设置页无添加服务器入口、无账号区块、无线路重命名。
- `mediaStore` 连接条目只有 `status/error`（中文字符串），不保留错误码，无法判断是否需要重新登录。
- `TauriCredentialStore.set` 与 Rust `CachedCredentialStore.set` 都是写穿缓存：覆盖 Token 后立即生效，无需改 Rust。
- E2E mock（`tests/e2e/support/media-servers.ts`）只对海报路由校验 Token，`/Users/AuthenticateByName` 不校验密码。E2E 存储为 `sessionStorage` 持久化的 `MemoryStorage/MemoryCredentialStore`，`page.reload()` 后 Profile 与 Token 保留。

## File Structure

### Create

- `apps/desktop/src/views/reauth-error-message.ts` — 重新登录失败的中文映射（UserMismatch/ServerMismatch/认证失败，其余委托 `connectionErrorMessage`）。
- `apps/desktop/src/views/reauth-error-message.test.ts`
- `tests/e2e/server-management.spec.ts` — 侧栏添加第二台服务器、改密后重新登录。

### Modify

- `packages/core/src/errors/app-error.ts` — `UserMismatch`。
- `packages/core/src/auth/login-service.ts` / `login-service.test.ts` — `lineLabel`、「主线路」、`reauthenticate`。
- `packages/core/src/index.ts` — 导出 `ReauthenticateInput`。
- `apps/desktop/src/views/SearchView.vue` / `SearchView.test.ts` — 单输入。
- `apps/desktop/src/views/HomeView.vue` / `HomeView.test.ts` — 去「当前连接」、凭证失效「重新登录」。
- `apps/desktop/src/views/OnboardingView.vue` / `OnboardingView.test.ts` — 线路名称、添加模式与取消。
- `apps/desktop/src/views/ServerSettingsView.vue` / `ServerSettingsView.test.ts` — 线路重命名、添加服务器、账号区块。
- `apps/desktop/src/router/index.ts` / `router/index.test.ts` — 无服务器守卫、去占位 Profile、`onboardingProps`、设置页重新登录注入。
- `apps/desktop/src/components/AppShell.vue` / `AppShell.test.ts` — 删除最后一台跳转、`RouterView` 门控、添加/重新登录导航。
- `apps/desktop/src/components/ServerSwitcher.vue` / `ServerSwitcher.test.ts` — `+` 与「重新登录」。
- `apps/desktop/src/stores/server-store.ts` / `server-store.test.ts` — `reauthenticate`。
- `apps/desktop/src/stores/media-store.ts` / `media-store.test.ts` — `resetConnection`、`connectionNeedsReauth`。
- `apps/desktop/src/stores/server-connection-status.ts` / `server-connection-status.test.ts` — `UserMismatch` 文案、`isAuthenticationExpired`。
- `tests/integration/support/mock-media-server.ts` — `requiredPassword`。
- `tests/e2e/support/media-servers.ts` — 全部授权路由校验 Token、认证校验密码、`changePassword`。
- `tests/e2e/browse-search-play.spec.ts` — 顶栏唯一搜索框。

### Explicitly unchanged

- `apps/desktop/src-tauri/**`、`packages/player/**`、全部 `package.json`、`apps/desktop/src/main.ts`（其启动跳转与新守卫等效，保留不动）、`apps/desktop/src/composition/**`（`AppServices.login` 类型为 `LoginService`，新方法自动可用）。

## Canonical Interfaces

后续任务只消费以下签名：

```ts
// packages/core/src/auth/login-service.ts
export interface AddServerInput {
  name: string
  kind: ServerKind
  baseUrl: string
  lineLabel?: string
  username: string
  password: string
  deviceId: string
  appVersion: string
}

export interface ReauthenticateInput {
  profileId: string
  password: string
  deviceId: string
  appVersion: string
}

// LoginService
addServer(input: AddServerInput): Promise<{ profile: ServerProfile; serverName: string }>
reauthenticate(input: ReauthenticateInput): Promise<ServerProfile>
```

```ts
// apps/desktop/src/stores/server-store.ts
reauthenticate(profileId: string, password: string): Promise<void>

// apps/desktop/src/stores/media-store.ts
resetConnection(profileId: string): void
connectionNeedsReauth(profileId: string): boolean

// apps/desktop/src/stores/server-connection-status.ts
export const USER_MISMATCH_MESSAGE: string
export function isAuthenticationExpired(error: unknown): boolean

// apps/desktop/src/views/reauth-error-message.ts
export function reauthErrorMessage(error: unknown): string

// apps/desktop/src/router/index.ts
export function settingsProps(route?: Pick<RouteLocationNormalizedLoaded, 'query'>): {
  // ...existing fields...
  profile: ServerProfile | null
  reauthOpen: boolean
  reauthenticate: (profileId: string, password: string) => Promise<void>
}
export function onboardingProps(
  route: Pick<RouteLocationNormalizedLoaded, 'query'>,
  router: Pick<Router, 'replace' | 'back' | 'options'>,
): {
  mode: 'first' | 'add'
  addServer: (input: OnboardingInput) => Promise<{ serverName: string; serverId: string; id: string }>
  cancel?: () => void
}
```

```ts
// Component contracts
// OnboardingView props: addServer, mode?: 'first' | 'add', cancel?: () => void
// ServerSwitcher props: profiles, activeId, statusById?, needsReauthById?
// ServerSwitcher emits: select [id], retry [id], add [], reauth [id]
// ServerSettingsView new props: reauthOpen?: boolean,
//   reauthenticate?: (profileId: string, password: string) => Promise<void>
// 设置页重新登录入口路由：{ name: 'settings', query: { reauth: '1' } }
```

---

## Task 1: 搜索单输入与首页线路去重

**Files:**

- Modify: `apps/desktop/src/views/SearchView.vue`
- Modify: `apps/desktop/src/views/SearchView.test.ts`
- Modify: `apps/desktop/src/views/HomeView.vue`
- Modify: `apps/desktop/src/views/HomeView.test.ts`

**Interfaces:**

- Consumes: 顶栏 `AppShell.onTopSearch` 写入的 `route.query.q`（现状不变）；`mediaStore.searchResults/connectionStatus/connectionError`。
- Produces: `SearchView` 无任何输入框与线路行，只读 `route.query.q`；`HomeView` 无「当前连接」卡片、无 `active-line`。

**被删除元素与测试变更：** `SearchView.test.ts` 中所有 `[name="search"]` 的 `setValue` 改为 `router.push({ path: '/search', query: { q } })`；删除 “shows the resolved active line label…” 用例（元素已删除，线路标签由顶栏 HUD 的 `line-status-pill` 测试覆盖）。`HomeView.test.ts` 删除 `active-line` 包含 `Backup` 与 `连接状态：连接正常` 两条断言，改为断言二者不存在。

- [ ] **Step 1: 重写 SearchView 测试为读取路由关键词**

用以下内容整体替换 `apps/desktop/src/views/SearchView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@lumaroute/core'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import SearchView from './SearchView.vue'

const movie: MediaItem = {
  id: 'item-1',
  kind: 'movie',
  name: 'Arrival',
  overview: 'A linguist works with the military.',
  productionYear: 2016,
  runtimeSeconds: 7200,
  parentId: null,
  seriesId: null,
  indexNumber: null,
  imageTag: 'tag-1',
  playbackPositionSeconds: 0,
}

function mountSearch(options: { activeServerId: string; results?: MediaItem[] }) {
  const results = options.results ?? [movie]
  const media = {
    getLibraries: vi.fn(),
    getContinueWatching: vi.fn(),
    getItems: vi.fn(),
    search: vi.fn().mockResolvedValue({
      value: { items: results, total: results.length, startIndex: 0 },
      lineId: 'line-1',
    }),
  }
  const services = { media } as unknown as AppServices
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', name: 'search', component: SearchView, props: true },
      { path: '/media/:itemId', name: 'media', component: { template: '<div />' } },
    ],
  })

  const wrapper = mount(SearchView, {
    props: { activeServerId: options.activeServerId },
    global: {
      plugins: [pinia, router],
      provide: { [servicesKey as symbol]: services },
      stubs: {
        RouterLink,
        VirtualPosterGrid: {
          props: ['items'],
          template: `
            <div data-testid="poster-grid">
              <div
                v-for="item in items"
                :key="item.id"
                data-testid="media-card"
              >{{ item.name }}</div>
            </div>
          `,
        },
      },
    },
  })

  return { wrapper, media, router }
}

describe('SearchView', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('has no own search input or line row and debounces the route keyword', async () => {
    vi.useFakeTimers()
    const { wrapper, media, router } = mountSearch({ activeServerId: 'profile-2' })
    await router.push({ path: '/search', query: { q: 'Arrival' } })
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('[role="searchbox"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="active-line"]').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(249)
    expect(media.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(media.search).toHaveBeenCalledWith(
      'profile-2',
      {
        term: 'Arrival',
        kinds: ['movie', 'series', 'season', 'episode'],
        startIndex: 0,
        limit: 40,
      },
      expect.any(AbortSignal),
    )
    await flushPromises()
    expect(wrapper.get('.result-title').text()).toBe('搜索「Arrival」· 1 条（当前服务器）')
    expect(wrapper.text()).toContain(movie.name)
  })

  it('points to the top search box when the route has no keyword', async () => {
    const { wrapper, media, router } = mountSearch({ activeServerId: 'profile-2' })
    await router.push('/search')
    expect(wrapper.get('[data-testid="search-empty"]').text()).toBe(
      '在顶部搜索框输入关键词（⌘K / Ctrl+K）',
    )
    expect(media.search).not.toHaveBeenCalled()
  })

  it('replaces the grid with an empty state when the current server has no matches', async () => {
    vi.useFakeTimers()
    const { wrapper, media, router } = mountSearch({ activeServerId: 'profile-2', results: [] })
    await router.push({ path: '/search', query: { q: 'Nothing' } })
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(media.search).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="search-no-results"]').text()).toBe('当前服务器没有匹配的结果。')
    expect(wrapper.find('[data-testid="poster-grid"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 修改 HomeView 测试断言“当前连接”已移除**

在 `apps/desktop/src/views/HomeView.test.ts` 首个用例中，把

```ts
    expect(wrapper.get('[data-testid="active-line"]').text()).toContain('Backup')
    expect(wrapper.text()).toContain('连接状态：连接正常')
```

替换为

```ts
    expect(wrapper.find('[data-testid="active-line"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('当前连接')
```

- [ ] **Step 3: 运行测试确认红灯**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src/views/SearchView.test.ts apps/desktop/src/views/HomeView.test.ts`

Expected: FAIL —— SearchView 仍渲染 `input`/`active-line`，空态文案仍为「输入关键词以搜索当前服务器」；HomeView 仍渲染 `active-line` 与「当前连接」。

- [ ] **Step 4: 实现 SearchView 单输入**

用以下内容替换 `SearchView.vue` 的 `<script setup>` 与 `<template>`：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { MediaItem } from '@lumaroute/core'
import { injectServices } from '../composition/inject-services'
import VirtualPosterGrid from '../components/VirtualPosterGrid.vue'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'

const props = defineProps<{
  activeServerId?: string
}>()

const services = injectServices()
const appStore = useAppStore()
const mediaStore = useMediaStore()
const route = useRoute()
const term = ref(typeof route.query.q === 'string' ? route.query.q : '')
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let searchController: AbortController | null = null

const resolvedServerId = computed(
  () => appStore.activeServerId ?? (props.activeServerId !== 'missing' ? props.activeServerId : null),
)

const searchItems = computed<readonly MediaItem[]>(
  () => mediaStore.searchResults?.items ?? [],
)

const hasTerm = computed(() => term.value.trim().length > 0)
const resultCount = computed(() => mediaStore.searchResults?.total ?? searchItems.value.length)

function clearDebounce(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

async function searchCurrentServer(serverId: string, nextTerm: string): Promise<void> {
  searchController?.abort()
  searchController = new AbortController()
  if (!nextTerm.trim()) {
    mediaStore.searchResults = { items: [], total: 0, startIndex: 0 }
    return
  }
  const result = await services.media.search(
    serverId,
    {
      term: nextTerm,
      kinds: ['movie', 'series', 'season', 'episode'],
      startIndex: 0,
      limit: 40,
    },
    searchController.signal,
  )
  mediaStore.searchResults = result.value
  mediaStore.activeLineId = result.lineId
}

function scheduleSearch(nextTerm: string): void {
  const serverId = resolvedServerId.value
  if (!serverId) return
  clearDebounce()
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void searchCurrentServer(serverId, nextTerm)
  }, 250)
}

watch(
  () => resolvedServerId.value,
  () => {
    searchController?.abort()
    clearDebounce()
    if (term.value.trim()) scheduleSearch(term.value)
  },
)

watch(
  () => route.query.q,
  (query) => {
    const next = typeof query === 'string' ? query : ''
    if (next === term.value) return
    term.value = next
    scheduleSearch(next)
  },
)

onBeforeUnmount(() => {
  clearDebounce()
  searchController?.abort()
  searchController = null
})

if (term.value.trim()) {
  scheduleSearch(term.value)
}
</script>

<template>
  <section class="search-view">
    <header class="view-header">
      <h1>搜索</h1>
    </header>

    <h2
      v-if="hasTerm && mediaStore.searchResults"
      class="result-title"
    >
      搜索「{{ term.trim() }}」· {{ resultCount }} 条（当前服务器）
    </h2>

    <p
      v-if="!hasTerm"
      class="empty-state lr-muted"
      data-testid="search-empty"
    >
      在顶部搜索框输入关键词（⌘K / Ctrl+K）
    </p>

    <p
      v-else-if="mediaStore.searchResults && searchItems.length === 0"
      class="empty-state lr-muted"
      data-testid="search-no-results"
    >
      当前服务器没有匹配的结果。
    </p>

    <VirtualPosterGrid
      v-else-if="mediaStore.searchResults && resolvedServerId"
      :items="searchItems"
      :profile-id="resolvedServerId"
      :estimate-size="240"
    />
  </section>
</template>
```

在 `<style scoped>` 中删除 `.search-field input { … }`、`.search-field input:hover:not(:disabled):not(:focus) { … }` 与 `.line-note { … }` 三个规则块，其余样式不变。

- [ ] **Step 5: 实现 HomeView 去「当前连接」**

用以下内容替换 `HomeView.vue` 的 `<script setup>`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ContinueWatchingCard from '../components/ContinueWatchingCard.vue'
import { collectionTypeLabel } from '../presentation/media-presenters'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import type { ServerConnectionStatus } from '../stores/server-connection-status'

const props = defineProps<{
  activeServerId?: string
}>()

const appStore = useAppStore()
const mediaStore = useMediaStore()

/** Prefer live app-store id; route props can stay stale after bootstrap/server switch. */
const activeServerId = computed(
  () => appStore.activeServerId ?? (props.activeServerId !== 'missing' ? props.activeServerId : null),
)

const status = computed<ServerConnectionStatus>(() =>
  activeServerId.value ? mediaStore.connectionStatus(activeServerId.value) : 'unknown',
)
const errorMessage = computed(() =>
  activeServerId.value ? mediaStore.connectionError(activeServerId.value) : null,
)
</script>
```

在 `<template>` 中删除整个 `<section class="lr-glass-card line-card" aria-labelledby="line-heading"> … </section>`（含 `data-testid="active-line"` 与「连接状态」段落），`home-bento` 内其余结构保持不变。

在 `<style scoped>` 中：

1. 将 `.home-bento` 规则替换为：

```css
.home-bento {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
```

2. 删除 `.home-status, .continue-panel, .library-bento { grid-column: 2; }`、`.line-card { grid-row: 1 / span 2; }`、整个 `@media (max-width: 60rem) { … }`、`.line-card p { … }`、`.line-label { … }` 规则块。
3. 将 `.line-card,\n.continue-panel {` 选择器改为 `.continue-panel {`。

- [ ] **Step 6: 运行测试确认绿灯**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src/views/SearchView.test.ts apps/desktop/src/views/HomeView.test.ts apps/desktop/src/components/AppShell.test.ts`

Expected: PASS；HUD 线路 pill 用例（`line-status-pill`）不受影响。

- [ ] **Step 7: 类型检查、全量质量门并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck && pnpm check && git diff --check`

Expected: 全部 PASS；`git diff --check` 无输出。

```bash
git add apps/desktop/src/views/SearchView.vue apps/desktop/src/views/SearchView.test.ts apps/desktop/src/views/HomeView.vue apps/desktop/src/views/HomeView.test.ts
git commit -m "fix: keep a single search input and drop duplicate home line card"
```

## Task 2: 线路命名（默认「主线路」、引导页线路名称、设置页重命名）

**Files:**

- Modify: `packages/core/src/auth/login-service.ts`
- Modify: `packages/core/src/auth/login-service.test.ts`
- Modify: `apps/desktop/src/views/OnboardingView.vue`
- Modify: `apps/desktop/src/views/OnboardingView.test.ts`
- Modify: `apps/desktop/src/views/ServerSettingsView.vue`
- Modify: `apps/desktop/src/views/ServerSettingsView.test.ts`

**Interfaces:**

- Consumes: `ServerSettingsView` 现有 `updateLines(profileId, lines, preferredLineId)` 回调（`settingsProps` → `serverStore.updateLines` → `ServerCatalog.updateLines`）。
- Produces: `AddServerInput.lineLabel?: string`；`OnboardingInput`（`Omit<AddServerInput, 'deviceId' | 'appVersion'>`）自动包含 `lineLabel`，`serverStore.addServer` 透传无需修改。

- [ ] **Step 1: 写失败的 core 默认线路名测试**

在 `packages/core/src/auth/login-service.test.ts` 的 `describe('LoginService')` 内追加：

```ts
  it.each<[{ lineLabel?: string }, string]>([
    [{}, '主线路'],
    [{ lineLabel: '   ' }, '主线路'],
    [{ lineLabel: '  家里  ' }, '家里'],
  ])('names the first line from %j', async (extra, expected) => {
    const adapter = {
      authenticate: vi.fn().mockResolvedValue({
        serverId: 'server-a',
        serverName: 'Home',
        userId: 'user-a',
        username: 'alice',
        accessToken: 'token-value',
      }),
      getServerIdentity: vi.fn(),
    }
    const credentials = { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
    const storage = { saveServerProfile: vi.fn() }
    const ids = vi.fn().mockReturnValueOnce('profile-1').mockReturnValueOnce('line-1')
    const service = new LoginService(() => adapter, storage as never, credentials, ids)

    const { profile } = await service.addServer({
      name: 'Home',
      kind: 'jellyfin',
      baseUrl: 'https://media.example.com',
      username: 'alice',
      password: 'password-value',
      deviceId: 'device-1',
      appVersion: '0.1.0',
      ...extra,
    })

    expect(profile.lines[0]?.label).toBe(expected)
    expect(JSON.stringify(profile)).not.toContain('Primary')
  })
```

- [ ] **Step 2: 写失败的引导页线路名称测试**

在 `apps/desktop/src/views/OnboardingView.test.ts` 的 `describe('OnboardingView')` 内追加：

```ts
  it('submits an optional line name with a 主线路 placeholder', async () => {
    const addServer = vi.fn().mockResolvedValue({ id: 'profile-1' })
    const wrapper = mount(OnboardingView, { props: { addServer } })
    const lineLabel = wrapper.get('[name="lineLabel"]')
    expect(lineLabel.attributes('placeholder')).toBe('主线路')
    expect(lineLabel.attributes('required')).toBeUndefined()
    expect(wrapper.text()).toContain('线路名称')
    await wrapper.get('[name="name"]').setValue('Home')
    await wrapper.get('[name="baseUrl"]').setValue('https://media.example.com')
    await lineLabel.setValue('家里')
    await wrapper.get('[name="username"]').setValue('alice')
    await wrapper.get('[name="password"]').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(addServer).toHaveBeenCalledWith(expect.objectContaining({ lineLabel: '家里' }))
  })
```

- [ ] **Step 3: 写失败的设置页线路重命名测试**

在 `apps/desktop/src/views/ServerSettingsView.test.ts` 的 `describe('ServerSettingsView')` 内追加：

```ts
  it('renames a line label without touching other line fields', async () => {
    const { wrapper, updateLines } = mountSettings({ profiles: [profileOne] })
    await wrapper.get('[data-testid="rename-line-line-1"]').trigger('click')
    await wrapper.get('[data-testid="line-label-input-line-1"]').setValue('  家里  ')
    await wrapper.get('[data-testid="line-item-line-1"] form').trigger('submit')
    await flushPromises()
    expect(updateLines).toHaveBeenCalledWith(
      'profile-1',
      [{ ...profileOne.lines[0]!, label: '家里' }, profileOne.lines[1]!],
      'line-1',
    )
    expect(wrapper.find('[data-testid="line-label-input-line-1"]').exists()).toBe(false)
  })

  it('refuses to save a blank line label', async () => {
    const { wrapper, updateLines } = mountSettings({ profiles: [profileOne] })
    await wrapper.get('[data-testid="rename-line-line-1"]').trigger('click')
    await wrapper.get('[data-testid="line-label-input-line-1"]').setValue('   ')
    await wrapper.get('[data-testid="line-item-line-1"] form').trigger('submit')
    await flushPromises()
    expect(updateLines).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="line-rename-error"]').text()).toBe('线路名称不能为空')
    await wrapper.get('[data-testid="cancel-line-label-line-1"]').trigger('click')
    expect(wrapper.find('[data-testid="line-rename-error"]').exists()).toBe(false)
  })
```

- [ ] **Step 4: 运行测试确认红灯**

Run: `pnpm vitest run --config vitest.workspace.ts packages/core/src/auth/login-service.test.ts apps/desktop/src/views/OnboardingView.test.ts apps/desktop/src/views/ServerSettingsView.test.ts`

Expected: FAIL —— core 仍返回 `Primary` 且 `lineLabel` 不是 `AddServerInput` 字段（vitest 运行时只报断言失败）；引导页无 `[name="lineLabel"]`；设置页无 `rename-line-line-1`。

- [ ] **Step 5: 实现 core 可选线路名**

在 `packages/core/src/auth/login-service.ts`：

1. 在 `AddServerInput` 的 `baseUrl: string` 之后加入 `lineLabel?: string`。
2. 在 `export class LoginService` 之前加入：

```ts
const DEFAULT_LINE_LABEL = '主线路'
```

3. 将线路对象中的 `label: 'Primary',` 替换为：

```ts
          label: input.lineLabel?.trim() || DEFAULT_LINE_LABEL,
```

- [ ] **Step 6: 实现引导页线路名称字段**

在 `OnboardingView.vue` 中：

1. `form` 的 `reactive({...})` 在 `baseUrl: '',` 之后加入 `lineLabel: '',`。
2. `props.addServer({...})` 调用在 `baseUrl: form.baseUrl,` 之后加入 `lineLabel: form.lineLabel,`。
3. 在「主线路 URL」`<label>` 之后插入：

```vue
        <label class="lr-field">
          <span>线路名称</span>
          <input
            v-model.trim="form.lineLabel"
            name="lineLabel"
            placeholder="主线路"
            autocomplete="off"
          >
        </label>
```

- [ ] **Step 7: 实现设置页线路重命名**

在 `ServerSettingsView.vue` `<script setup>` 中，`const draftName = ref(props.profile.name)` 之后加入：

```ts
const editingLineId = ref<string | null>(null)
const lineLabelDraft = ref('')
const lineRenameError = ref<string | null>(null)
```

在 `renameCurrent()` 之后加入：

```ts
function startRenameLine(line: ServerLine): void {
  editingLineId.value = line.id
  lineLabelDraft.value = line.label
  lineRenameError.value = null
}

function cancelRenameLine(): void {
  editingLineId.value = null
  lineRenameError.value = null
}

async function saveLineLabel(lineId: string): Promise<void> {
  if (!props.updateLines) return
  const label = lineLabelDraft.value.trim()
  if (!label) {
    lineRenameError.value = '线路名称不能为空'
    return
  }
  const lines = props.profile.lines.map((line) => (line.id === lineId ? { ...line, label } : line))
  await props.updateLines(props.profile.id, lines, props.profile.preferredLineId)
  cancelRenameLine()
}
```

在模板中把线路卡的

```vue
          <div class="line-node-head">
            <strong class="line-label">{{ line.label }}</strong>
```

替换为

```vue
          <div class="line-node-head">
            <form
              v-if="editingLineId === line.id"
              class="line-rename"
              @submit.prevent="saveLineLabel(line.id)"
            >
              <input
                v-model="lineLabelDraft"
                name="line-rename"
                aria-label="线路名称"
                :data-testid="`line-label-input-${line.id}`"
              >
              <button
                type="submit"
                class="lr-btn-primary lr-btn-sm"
                :data-testid="`save-line-label-${line.id}`"
              >
                保存
              </button>
              <button
                type="button"
                class="lr-btn-ghost lr-btn-sm"
                :data-testid="`cancel-line-label-${line.id}`"
                @click="cancelRenameLine"
              >
                取消
              </button>
            </form>
            <strong
              v-else
              class="line-label"
            >{{ line.label }}</strong>
```

在同一 `<li>` 中 `<span class="line-url lr-muted">…</span>` 之前插入：

```vue
          <p
            v-if="editingLineId === line.id && lineRenameError"
            class="line-rename-error"
            role="alert"
            data-testid="line-rename-error"
          >
            {{ lineRenameError }}
          </p>
```

在 `<div class="line-actions">` 的第一个子元素之前插入：

```vue
            <button
              type="button"
              class="lr-btn-ghost lr-btn-sm"
              :data-testid="`rename-line-${line.id}`"
              @click="startRenameLine(line)"
            >
              重命名
            </button>
```

在 `<style scoped>` 末尾追加：

```css
.line-rename {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  min-width: 0;
}

.line-rename input {
  min-width: 10rem;
}

.line-rename-error {
  margin: 0;
  font-size: var(--lr-font-sm);
  color: var(--lr-danger);
}
```

输入框 `name` 必须是 `line-rename`，不能与 `LineEditor` 的 `line-label` 重名（E2E fixture 用 `input[name="line-label"]` 严格定位）。

- [ ] **Step 8: 运行测试确认绿灯**

Run: `pnpm vitest run --config vitest.workspace.ts packages/core/src/auth/login-service.test.ts apps/desktop/src/views/OnboardingView.test.ts apps/desktop/src/views/ServerSettingsView.test.ts apps/desktop/src/stores/server-store.test.ts`

Expected: PASS；原有 “stores only the credential key” 与引导页错误映射用例保持通过。

- [ ] **Step 9: 类型检查、全量质量门并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck && pnpm check && git diff --check`

Expected: 全部 PASS；`git diff --check` 无输出。

```bash
git add packages/core/src/auth/login-service.ts packages/core/src/auth/login-service.test.ts apps/desktop/src/views/OnboardingView.vue apps/desktop/src/views/OnboardingView.test.ts apps/desktop/src/views/ServerSettingsView.vue apps/desktop/src/views/ServerSettingsView.test.ts
git commit -m "feat: name lines in Chinese by default and allow renaming"
```

## Task 3: 无服务器状态（守卫、去占位 Profile、删除最后一台回引导页）

**Files:**

- Modify: `apps/desktop/src/router/index.ts`
- Modify: `apps/desktop/src/router/index.test.ts`
- Modify: `apps/desktop/src/components/AppShell.vue`
- Modify: `apps/desktop/src/components/AppShell.test.ts`
- Modify: `apps/desktop/src/stores/server-store.test.ts`

**Interfaces:**

- Consumes: `serverStore.profiles`；`serverStore.deleteServer` 现有行为（删除后 `profiles` 过滤、活动服务器被删时 `app.selectServer(profiles[0]?.id ?? null)`）。
- Produces: `createAppRouter()` 注册 `beforeEach` 守卫；`settingsProps().profile` 类型为 `ServerProfile | null`；`AppShell` 在 `profiles.length` 变为 0 时 `router.replace({ name: 'onboarding' })`，且 `<RouterView>` 仅在存在 Profile 时渲染（保证 `ServerSettingsView` 永远不会以 `null` Profile 渲染）。

- [ ] **Step 1: 写失败的路由守卫与 settingsProps 测试**

在 `apps/desktop/src/router/index.test.ts`：

1. 将 `import { settingsProps } from './index'` 改为 `import { createAppRouter, settingsProps } from './index'`。
2. 在 `describe('settingsProps')` 内追加：

```ts
  it('does not fabricate a placeholder profile when no server exists', () => {
    useServerStore().profiles = []
    useAppStore().activeServerId = null
    expect(settingsProps().profile).toBeNull()
  })
```

3. 文件末尾追加：

```ts
describe('createAppRouter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('redirects every shell route to onboarding while no server exists', async () => {
    useServerStore().profiles = []
    const router = createAppRouter()
    await router.push('/settings')
    expect(router.currentRoute.value.name).toBe('onboarding')
    await router.push('/search?q=Arrival')
    expect(router.currentRoute.value.name).toBe('onboarding')
  })

  it('keeps shell routes reachable once a server exists', async () => {
    useServerStore().profiles = [profile]
    const router = createAppRouter()
    await router.push('/search')
    expect(router.currentRoute.value.name).toBe('search')
  })
})
```

- [ ] **Step 2: 写失败的删除最后一台服务器测试**

在 `apps/desktop/src/components/AppShell.test.ts` 的 `mountPopulatedShell()` 中：

1. 路由表替换为：

```ts
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/onboarding', name: 'onboarding', component: { template: '<div />' } },
      {
        path: '/',
        component: AppShell,
        children: [
          {
            path: '',
            name: 'home',
            component: HomeView,
            props: () => ({
              activeServerId: useAppStore().activeServerId ?? 'missing',
            }),
          },
          { path: 'library/:libraryId', component: { template: '<div />' } },
          { path: 'settings', name: 'settings', component: { template: '<div />' } },
        ],
      },
    ],
  })
```

2. 返回值改为 `return { wrapper, app, services, router }`。

在 `describe('AppShell home content')` 内追加：

```ts
  it('returns to onboarding and stops rendering shell content after the last server is removed', async () => {
    const { wrapper, app, router } = await mountPopulatedShell()
    expect(wrapper.findComponent(HomeView).exists()).toBe(true)
    await app.runWithContext(async () => {
      useServerStore().profiles = []
    })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('onboarding')
    expect(wrapper.findComponent(HomeView).exists()).toBe(false)
    wrapper.unmount()
  })
```

在 `apps/desktop/src/stores/server-store.test.ts` 的 `describe('useServerStore')` 内追加回归护栏（现有行为，预期直接通过，用于锁定 AppShell 依赖的状态变化）：

```ts
  it('leaves no active server after the last server is deleted', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const services = { catalog: { remove } } as unknown as AppServices
    await withServices(services, async (store) => {
      store.profiles = [{ id: 'profile-2', name: 'Office' }] as never
      await store.deleteServer('profile-2')
      expect(store.profiles).toEqual([])
      expect(selectServer).toHaveBeenCalledWith(null)
    })
  })
```

- [ ] **Step 3: 运行测试确认红灯**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src/router/index.test.ts apps/desktop/src/components/AppShell.test.ts apps/desktop/src/stores/server-store.test.ts`

Expected: FAIL —— `settingsProps().profile` 为 `{ id: 'missing', … }`；无守卫，`/settings` 停留在 `settings`；清空 Profile 后路由不变、HomeView 仍渲染。`leaves no active server…` 用例 PASS（护栏）。

- [ ] **Step 4: 实现去占位 Profile 与守卫**

在 `apps/desktop/src/router/index.ts`：

1. `settingsProps()` 中把

```ts
  const profile =
    serverStore.profiles.find((entry) => entry.id === activeId) ?? serverStore.profiles[0]
```

替换为

```ts
  const profile =
    serverStore.profiles.find((entry) => entry.id === activeId) ?? serverStore.profiles[0] ?? null
```

2. 返回对象中把整个 `profile: profile ?? { id: 'missing', … lines: [] as ServerLine[], },` 替换为 `profile,`。`ServerLine` 导入仍被 `addLine/updateLines` 使用，保留。
3. 将 `createAppRouter()` 改为先创建再注册守卫：

```ts
export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      // 原有 routes 数组内容逐字保留
    ],
  })

  router.beforeEach((to) => {
    if (to.name === 'onboarding') return true
    return useServerStore().profiles.length > 0 ? true : { name: 'onboarding' }
  })

  return router
}
```

（上面的注释行表示把现有 `routes: [...]` 数组原样移入，不改任何路由记录。）

- [ ] **Step 5: 实现 AppShell 删除最后一台回引导页与内容门控**

在 `AppShell.vue` `<script setup>` 中，现有 `watch(() => appStore.activeServerId, …)` 之后加入：

```ts
watch(
  () => serverStore.profiles.length,
  (count) => {
    if (count === 0) void router.replace({ name: 'onboarding' })
  },
)
```

模板中把 `<RouterView />` 替换为：

```vue
        <RouterView v-if="serverStore.profiles.length > 0" />
```

- [ ] **Step 6: 运行测试确认绿灯**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src/router/index.test.ts apps/desktop/src/components/AppShell.test.ts apps/desktop/src/stores/server-store.test.ts apps/desktop/src/App.test.ts apps/desktop/src/views/ServerSettingsView.test.ts`

Expected: PASS；`App.test.ts` 的引导页初始渲染不受守卫影响。

- [ ] **Step 7: 类型检查、全量质量门并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck && pnpm check && git diff --check`

Expected: 全部 PASS；`git diff --check` 无输出。

```bash
git add apps/desktop/src/router/index.ts apps/desktop/src/router/index.test.ts apps/desktop/src/components/AppShell.vue apps/desktop/src/components/AppShell.test.ts apps/desktop/src/stores/server-store.test.ts
git commit -m "fix: return to onboarding when no server profile exists"
```

## Task 4: 添加服务器入口与引导页添加模式

**Files:**

- Modify: `apps/desktop/src/router/index.ts`
- Modify: `apps/desktop/src/router/index.test.ts`
- Modify: `apps/desktop/src/views/OnboardingView.vue`
- Modify: `apps/desktop/src/views/OnboardingView.test.ts`
- Modify: `apps/desktop/src/components/ServerSwitcher.vue`
- Modify: `apps/desktop/src/components/ServerSwitcher.test.ts`
- Modify: `apps/desktop/src/components/AppShell.vue`
- Modify: `apps/desktop/src/components/AppShell.test.ts`
- Modify: `apps/desktop/src/views/ServerSettingsView.vue`
- Modify: `apps/desktop/src/views/ServerSettingsView.test.ts`
- Modify: `apps/desktop/src/stores/server-store.test.ts`

**Interfaces:**

- Consumes: Task 3 的 `const router = createRouter(...)` 结构与 `AppShell.test` 中命名路由 `onboarding/settings`；`serverStore.addServer`（现有：保存 → `refreshProfiles` → `app.selectServer(新 id)`）。
- Produces: `onboardingProps(route, router)`；`OnboardingView` props `mode?: 'first' | 'add'`、`cancel?: () => void`；`ServerSwitcher` emit `add`；`AppShell` 处理 `add` 导航到 `{ name: 'onboarding', query: { mode: 'add' } }`；设置页 `data-testid="settings-add-server"` 链接。

- [ ] **Step 1: 写失败的 onboardingProps 测试**

在 `apps/desktop/src/router/index.test.ts`：

1. 顶部导入改为：

```ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import type { ServerProfile } from '@lumaroute/core'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import { useServerStore } from '../stores/server-store'
import { createAppRouter, onboardingProps, settingsProps } from './index'
```

2. 文件末尾追加：

```ts
describe('onboardingProps', () => {
  function fakeRouter(back: string | null) {
    return {
      replace: vi.fn().mockResolvedValue(undefined),
      back: vi.fn(),
      options: { history: { state: { back } } },
    } as unknown as Router
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    useServerStore().profiles = [profile]
  })

  it('offers cancel in add mode and returns to the previous page', () => {
    const router = fakeRouter('/settings')
    const props = onboardingProps({ query: { mode: 'add' } }, router)
    expect(props.mode).toBe('add')
    props.cancel?.()
    expect(router.back).toHaveBeenCalledOnce()
  })

  it('falls back to home when add mode has no in-app history', () => {
    const router = fakeRouter(null)
    onboardingProps({ query: { mode: 'add' } }, router).cancel?.()
    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith({ name: 'home' })
  })

  it('hides cancel on first launch even if mode=add is requested', () => {
    useServerStore().profiles = []
    const props = onboardingProps({ query: { mode: 'add' } }, fakeRouter('/'))
    expect(props.mode).toBe('first')
    expect(props.cancel).toBeUndefined()
  })

  it('lands on home after the new server is saved', async () => {
    const router = fakeRouter(null)
    const store = useServerStore()
    const addServer = vi
      .spyOn(store, 'addServer')
      .mockResolvedValue({ serverName: 'Office', serverId: 'server-b', id: 'profile-2' })
    const input = {
      name: 'Office',
      kind: 'jellyfin' as const,
      baseUrl: 'https://office.example',
      username: 'alice',
      password: 'secret',
    }
    await onboardingProps({ query: { mode: 'add' } }, router).addServer(input)
    expect(addServer).toHaveBeenCalledWith(input)
    expect(router.replace).toHaveBeenCalledWith({ name: 'home' })
  })
})
```

在 `apps/desktop/src/stores/server-store.test.ts` 的 “adds a server through ephemeral origin…” 用例末尾追加（锁定“设为当前服务器”）：

```ts
    expect(selectServer).toHaveBeenCalledWith('profile-1')
```

- [ ] **Step 2: 写失败的组件入口测试**

`apps/desktop/src/views/OnboardingView.test.ts` 追加：

```ts
  it('shows cancel only in add mode and delegates it', async () => {
    const cancel = vi.fn()
    const wrapper = mount(OnboardingView, { props: { addServer: vi.fn(), mode: 'add', cancel } })
    expect(wrapper.text()).toContain('添加另一台 Emby / Jellyfin 服务器')
    await wrapper.get('[data-testid="onboarding-cancel"]').trigger('click')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('hides cancel on first launch', () => {
    const wrapper = mount(OnboardingView, { props: { addServer: vi.fn() } })
    expect(wrapper.find('[data-testid="onboarding-cancel"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('连接第一台 Emby / Jellyfin 服务器')
  })
```

`apps/desktop/src/components/ServerSwitcher.test.ts` 追加：

```ts
  it('emits add from the labelled plus button next to the heading', async () => {
    const wrapper = mountSwitcher({})
    const add = wrapper.get('[data-testid="add-server"]')
    expect(add.attributes('aria-label')).toBe('添加服务器')
    expect(add.text()).toBe('+')
    await add.trigger('click')
    expect(wrapper.emitted('add')).toEqual([[]])
  })
```

`apps/desktop/src/components/AppShell.test.ts` 追加：

```ts
  it('opens add-server onboarding from the sidebar plus button', async () => {
    const { wrapper, router } = await mountPopulatedShell()
    await wrapper.get('[data-testid="add-server"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/onboarding?mode=add')
    wrapper.unmount()
  })
```

`apps/desktop/src/views/ServerSettingsView.test.ts`：

1. 第一行导入改为 `import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'`。
2. `mountSettings` 的 `mount(ServerSettingsView, { props: {…} })` 增加同级选项 `global: { stubs: { RouterLink: RouterLinkStub } },`。
3. 追加用例：

```ts
  it('links to add-server onboarding from the server list', () => {
    const { wrapper } = mountSettings({ profiles: [profileOne] })
    const link = wrapper.getComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({ name: 'onboarding', query: { mode: 'add' } })
    expect(link.text()).toBe('添加服务器')
    expect(link.attributes('data-testid')).toBe('settings-add-server')
  })
```

- [ ] **Step 3: 运行测试确认红灯**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src/router/index.test.ts apps/desktop/src/views/OnboardingView.test.ts apps/desktop/src/components/ServerSwitcher.test.ts apps/desktop/src/components/AppShell.test.ts apps/desktop/src/views/ServerSettingsView.test.ts apps/desktop/src/stores/server-store.test.ts`

Expected: FAIL —— `onboardingProps` 未导出；无 `onboarding-cancel`、`add-server`、`settings-add-server`。`selectServer` 断言 PASS（现有行为护栏）。

- [ ] **Step 4: 实现 onboardingProps 并接入路由**

在 `apps/desktop/src/router/index.ts`：

1. 首行导入改为：

```ts
import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalizedLoaded,
  type Router,
} from 'vue-router'
```

并加入 `import type { OnboardingInput } from '../composition/service-types'`。

2. 在 `settingsProps` 之后加入：

```ts
export function onboardingProps(
  route: Pick<RouteLocationNormalizedLoaded, 'query'>,
  router: Pick<Router, 'replace' | 'back' | 'options'>,
) {
  const serverStore = useServerStore()
  const adding = route.query.mode === 'add' && serverStore.profiles.length > 0
  return {
    mode: adding ? ('add' as const) : ('first' as const),
    addServer: async (input: OnboardingInput) => {
      const result = await serverStore.addServer(input)
      await router.replace({ name: 'home' })
      return result
    },
    ...(adding
      ? {
          cancel: () => {
            if (typeof router.options.history.state.back === 'string') router.back()
            else void router.replace({ name: 'home' })
          },
        }
      : {}),
  }
}
```

3. 把 `/onboarding` 路由记录的 `props: () => { const router = useRouter(); return { addServer: … } }` 整体替换为：

```ts
        props: (route) => onboardingProps(route, router),
```

（`router` 为 Task 3 在 `createAppRouter` 中声明的常量；props 函数在导航渲染时才调用，此时已赋值。）`useRouter` 不再使用，从导入中删除。

- [ ] **Step 5: 实现 OnboardingView 添加模式**

在 `OnboardingView.vue`：

1. `defineProps` 改为：

```ts
const props = defineProps<{
  addServer: (input: OnboardingInput) => Promise<AddServerResult | void>
  mode?: 'first' | 'add'
  cancel?: () => void
}>()
```

2. 副标题段落替换为：

```vue
        <p class="lr-muted subtitle">
          {{ mode === 'add' ? '添加另一台 Emby / Jellyfin 服务器' : '连接第一台 Emby / Jellyfin 服务器' }}
        </p>
```

3. 提交按钮 `<button class="lr-btn-primary lr-btn-lg submit" …>` 之后插入：

```vue
        <button
          v-if="mode === 'add' && cancel"
          type="button"
          class="lr-btn-secondary lr-btn-lg submit"
          data-testid="onboarding-cancel"
          :disabled="submitting"
          @click="cancel"
        >
          取消
        </button>
```

- [ ] **Step 6: 实现侧栏 `+` 与 AppShell 导航**

在 `ServerSwitcher.vue`：

1. `defineEmits` 改为：

```ts
const emit = defineEmits<{
  select: [profileId: string]
  retry: [profileId: string]
  add: []
}>()
```

2. 将 `<h2>服务器</h2>` 替换为：

```vue
    <div class="switcher-head">
      <h2>服务器</h2>
      <button
        type="button"
        class="add-button"
        data-testid="add-server"
        aria-label="添加服务器"
        title="添加服务器"
        @click="emit('add')"
      >
        +
      </button>
    </div>
```

3. `<style scoped>` 追加：

```css
.switcher-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 0.35rem;
}

.add-button {
  min-height: 1.5rem;
  min-width: 1.5rem;
  padding: 0;
  border: 1px solid var(--lr-border-subtle);
  border-radius: var(--lr-radius-xs);
  background: transparent;
  color: var(--lr-text-secondary);
  font-size: var(--lr-font-md);
  line-height: 1;
  box-shadow: none;
}

.add-button:hover {
  color: var(--lr-text-primary);
  border-color: var(--lr-border-hover);
  background: var(--lr-surface-hover);
}

.add-button:focus-visible {
  outline: none;
  box-shadow: var(--lr-focus-ring);
}
```

在 `AppShell.vue`：`onRetry` 之后加入

```ts
function onAddServer(): void {
  void router.push({ name: 'onboarding', query: { mode: 'add' } })
}
```

并在 `<ServerSwitcher … @retry="onRetry" />` 上追加 `@add="onAddServer"`。

- [ ] **Step 7: 实现设置页「添加服务器」**

在 `ServerSettingsView.vue`：

1. 加入 `import { RouterLink } from 'vue-router'`。
2. 「服务器列表」面板中把 `<h2>服务器列表</h2>` 替换为：

```vue
      <div class="panel-head">
        <h2>服务器列表</h2>
        <RouterLink
          class="lr-btn-secondary lr-btn-sm"
          data-testid="settings-add-server"
          :to="{ name: 'onboarding', query: { mode: 'add' } }"
        >
          添加服务器
        </RouterLink>
      </div>
```

3. `<style scoped>` 追加：

```css
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
```

- [ ] **Step 8: 运行测试确认绿灯**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src/router/index.test.ts apps/desktop/src/views/OnboardingView.test.ts apps/desktop/src/components/ServerSwitcher.test.ts apps/desktop/src/components/AppShell.test.ts apps/desktop/src/views/ServerSettingsView.test.ts apps/desktop/src/stores/server-store.test.ts apps/desktop/src/App.test.ts`

Expected: PASS。

- [ ] **Step 9: 类型检查、全量质量门并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck && pnpm check && git diff --check`

Expected: 全部 PASS；`git diff --check` 无输出。

```bash
git add apps/desktop/src/router/index.ts apps/desktop/src/router/index.test.ts apps/desktop/src/views/OnboardingView.vue apps/desktop/src/views/OnboardingView.test.ts apps/desktop/src/components/ServerSwitcher.vue apps/desktop/src/components/ServerSwitcher.test.ts apps/desktop/src/components/AppShell.vue apps/desktop/src/components/AppShell.test.ts apps/desktop/src/views/ServerSettingsView.vue apps/desktop/src/views/ServerSettingsView.test.ts apps/desktop/src/stores/server-store.test.ts
git commit -m "feat: add servers from the main shell via onboarding add mode"
```

## Task 5: Core `UserMismatch` 与 `LoginService.reauthenticate`

**Files:**

- Modify: `packages/core/src/errors/app-error.ts`
- Modify: `packages/core/src/auth/login-service.ts`
- Modify: `packages/core/src/auth/login-service.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `orderLines(profile, null)`（`packages/core/src/server/line-order.ts`）、`canFailOver(error)`（`packages/core/src/server/route-executor.ts`）、`StoragePort.getServerProfile`、`CredentialStore.set`、`AuthenticationAdapter.authenticate`。
- Produces: `AppErrorCode` 增加 `'UserMismatch'`；`ReauthenticateInput`；`LoginService.reauthenticate(input): Promise<ServerProfile>`（返回未修改的 Profile，不写 storage，不写 `RouteExecutor` 粘滞）。

- [ ] **Step 1: 写失败的 reauthenticate 测试**

在 `packages/core/src/auth/login-service.test.ts`：

1. 顶部导入改为：

```ts
import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors/app-error'
import type { ServerProfile } from '../server/types'
import { LoginService } from './login-service'
```

2. 文件末尾追加：

```ts
describe('LoginService.reauthenticate', () => {
  const profile: ServerProfile = {
    id: 'profile-1',
    name: 'Home',
    kind: 'jellyfin',
    serverId: 'server-a',
    userId: 'user-a',
    username: 'alice',
    credentialKey: 'lumaroute/profile-1',
    preferredLineId: 'line-wan',
    lines: [
      { id: 'line-lan', label: '家里', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
      { id: 'line-wan', label: '公网', baseUrl: 'https://media.example.com', priority: 1, enabled: true },
      { id: 'line-off', label: '备用', baseUrl: 'https://off.example.com', priority: 2, enabled: false },
    ],
  }
  const input = {
    profileId: 'profile-1',
    password: 'new-password-value',
    deviceId: 'device-1',
    appVersion: '0.1.0',
  }

  function session(overrides: Record<string, string> = {}) {
    return {
      serverId: 'server-a',
      serverName: 'Home',
      userId: 'user-a',
      username: 'alice',
      accessToken: 'rotated-token',
      ...overrides,
    }
  }

  function setup(authenticate: ReturnType<typeof vi.fn>, stored: ServerProfile | null = profile) {
    const adapter = { authenticate, getServerIdentity: vi.fn() }
    const credentials = { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(stored),
      saveServerProfile: vi.fn(),
    }
    const service = new LoginService(() => adapter, storage as never, credentials, vi.fn())
    return { service, credentials, storage, authenticate }
  }

  it('overwrites the token under the same credential key using the stored username', async () => {
    const { service, credentials, storage, authenticate } = setup(
      vi.fn().mockResolvedValue(session()),
    )
    await expect(service.reauthenticate(input)).resolves.toEqual(profile)
    expect(authenticate).toHaveBeenCalledOnce()
    expect(authenticate).toHaveBeenCalledWith({
      baseUrl: 'https://media.example.com',
      username: 'alice',
      password: 'new-password-value',
      deviceId: 'device-1',
      deviceName: 'LumaRoute',
      appVersion: '0.1.0',
    })
    expect(credentials.set).toHaveBeenCalledWith('lumaroute/profile-1', 'rotated-token')
    expect(storage.saveServerProfile).not.toHaveBeenCalled()
  })

  it('rejects a different server with ServerMismatch and keeps the old token', async () => {
    const { service, credentials } = setup(
      vi.fn().mockResolvedValue(session({ serverId: 'server-b' })),
    )
    await expect(service.reauthenticate(input)).rejects.toMatchObject({ code: 'ServerMismatch' })
    expect(credentials.set).not.toHaveBeenCalled()
  })

  it('rejects a different user with UserMismatch and keeps the old token', async () => {
    const { service, credentials } = setup(
      vi.fn().mockResolvedValue(session({ userId: 'user-b' })),
    )
    await expect(service.reauthenticate(input)).rejects.toMatchObject({ code: 'UserMismatch' })
    expect(credentials.set).not.toHaveBeenCalled()
  })

  it('does not mask a rejected password by switching lines', async () => {
    const { service, credentials, authenticate } = setup(
      vi.fn().mockRejectedValue(new AppError('AuthenticationExpired', 'Server credential was rejected')),
    )
    await expect(service.reauthenticate(input)).rejects.toMatchObject({
      code: 'AuthenticationExpired',
    })
    expect(authenticate).toHaveBeenCalledOnce()
    expect(credentials.set).not.toHaveBeenCalled()
  })

  it('fails over on timeout and never tries a disabled line', async () => {
    const { service, credentials, authenticate } = setup(
      vi
        .fn()
        .mockRejectedValueOnce(new AppError('LineTimeout', 'Request timed out'))
        .mockResolvedValueOnce(session()),
    )
    await service.reauthenticate(input)
    expect(authenticate.mock.calls.map(([call]) => call.baseUrl)).toEqual([
      'https://media.example.com',
      'http://192.168.1.2:8096',
    ])
    expect(credentials.set).toHaveBeenCalledWith('lumaroute/profile-1', 'rotated-token')
  })

  it('surfaces the last failover error after every enabled line fails', async () => {
    const { service, authenticate } = setup(
      vi.fn().mockRejectedValue(new AppError('LineTimeout', 'Request timed out')),
    )
    await expect(service.reauthenticate(input)).rejects.toMatchObject({ code: 'LineTimeout' })
    expect(authenticate).toHaveBeenCalledTimes(2)
  })

  it('reports NetworkUnavailable when no line is enabled', async () => {
    const disabled = { ...profile, lines: profile.lines.map((line) => ({ ...line, enabled: false })) }
    const { service, authenticate } = setup(vi.fn(), disabled)
    await expect(service.reauthenticate(input)).rejects.toMatchObject({
      code: 'NetworkUnavailable',
    })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('reports StorageFailure for an unknown profile', async () => {
    const { service } = setup(vi.fn(), null)
    await expect(service.reauthenticate(input)).rejects.toMatchObject({ code: 'StorageFailure' })
  })

  it('never echoes the password in mismatch errors', async () => {
    const { service } = setup(vi.fn().mockResolvedValue(session({ userId: 'user-b' })))
    const error = await service.reauthenticate(input).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).message).not.toContain('new-password-value')
    expect(JSON.stringify(error)).not.toContain('new-password-value')
  })
})
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `pnpm vitest run --config vitest.workspace.ts packages/core/src/auth/login-service.test.ts`

Expected: FAIL，`service.reauthenticate is not a function`。

- [ ] **Step 3: 增加错误码**

在 `packages/core/src/errors/app-error.ts` 的 `| 'ServerMismatch'` 之后加入：

```ts
  | 'UserMismatch'
```

- [ ] **Step 4: 实现 reauthenticate**

在 `packages/core/src/auth/login-service.ts`：

1. 导入区改为：

```ts
import { AppError } from '../errors/app-error'
import type { CredentialStore } from '../ports/credential-store'
import type { StoragePort } from '../ports/storage-port'
import { orderLines } from '../server/line-order'
import { canFailOver } from '../server/route-executor'
import type { ServerKind, ServerProfile } from '../server/types'
import type { AuthenticationAdapter } from './authentication-adapter'
import type { AuthSession } from './types'
```

2. 在 `AddServerInput` 之后加入：

```ts
export interface ReauthenticateInput {
  profileId: string
  password: string
  deviceId: string
  appVersion: string
}
```

3. 在 `addServer` 方法之后、类结束 `}` 之前加入：

```ts
  async reauthenticate(input: ReauthenticateInput): Promise<ServerProfile> {
    const profile = await this.storage.getServerProfile(input.profileId)
    if (!profile) throw new AppError('StorageFailure', 'Server profile was not found')
    const adapter = this.adapterFor(profile.kind)
    let lastError: unknown
    for (const line of orderLines(profile, null)) {
      let session: AuthSession
      try {
        session = await adapter.authenticate({
          baseUrl: line.baseUrl,
          username: profile.username,
          password: input.password,
          deviceId: input.deviceId,
          deviceName: 'LumaRoute',
          appVersion: input.appVersion,
        })
      } catch (error) {
        if (!canFailOver(error)) throw error
        lastError = error
        continue
      }
      if (session.serverId !== profile.serverId) {
        throw new AppError('ServerMismatch', 'The line belongs to a different server')
      }
      if (session.userId !== profile.userId) {
        throw new AppError('UserMismatch', 'The account does not match this server profile')
      }
      await this.credentials.set(profile.credentialKey, session.accessToken)
      return profile
    }
    throw lastError ?? new AppError('NetworkUnavailable', 'No enabled server line is available')
  }
```

- [ ] **Step 5: 导出类型**

在 `packages/core/src/index.ts` 把 `export type { AddServerInput } from './auth/login-service'` 替换为：

```ts
export type { AddServerInput, ReauthenticateInput } from './auth/login-service'
```

- [ ] **Step 6: 运行测试确认绿灯**

Run: `pnpm vitest run --config vitest.workspace.ts packages/core/src/auth packages/core/src/server packages/core/src/logging`

Expected: PASS；`redact` 与诊断测试不变（`UserMismatch` 走 `userActionFor` 默认分支 `copy diagnostics`，无需改动）。

- [ ] **Step 7: 类型检查、全量质量门并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck && pnpm check && git diff --check`

Expected: 全部 PASS（含 `check:boundaries`：core 未引入 Vue/Tauri）；`git diff --check` 无输出。

```bash
git add packages/core/src/errors/app-error.ts packages/core/src/auth/login-service.ts packages/core/src/auth/login-service.test.ts packages/core/src/index.ts
git commit -m "feat(core): re-authenticate a profile without changing its user"
```

## Task 6: 设置页账号区块与重新登录 store

**Files:**

- Create: `apps/desktop/src/views/reauth-error-message.ts`
- Create: `apps/desktop/src/views/reauth-error-message.test.ts`
- Modify: `apps/desktop/src/stores/server-connection-status.ts`
- Modify: `apps/desktop/src/stores/server-connection-status.test.ts`
- Modify: `apps/desktop/src/stores/media-store.ts`
- Modify: `apps/desktop/src/stores/media-store.test.ts`
- Modify: `apps/desktop/src/stores/server-store.ts`
- Modify: `apps/desktop/src/stores/server-store.test.ts`
- Modify: `apps/desktop/src/router/index.ts`
- Modify: `apps/desktop/src/router/index.test.ts`
- Modify: `apps/desktop/src/views/ServerSettingsView.vue`
- Modify: `apps/desktop/src/views/ServerSettingsView.test.ts`

**Interfaces:**

- Consumes: Task 5 `services.login.reauthenticate(input: ReauthenticateInput)`；`services.deviceIdentity.getOrCreate()`；`mediaStore.loadHome`；Task 4 的 `RouterLinkStub` 版 `mountSettings`。
- Produces: `USER_MISMATCH_MESSAGE`、`reauthErrorMessage(error)`、`mediaStore.resetConnection(profileId)`、`serverStore.reauthenticate(profileId, password)`、`settingsProps(route?)` 的 `reauthOpen/reauthenticate`、设置页 `data-testid`：`account-section`、`account-username`、`reauth-open`、`reauth-form`、`reauth-submit`、`reauth-cancel`、`reauth-status`、`reauth-error`，密码输入 `input[name="reauth-password"]`。

- [ ] **Step 1: 写失败的错误映射测试**

在 `apps/desktop/src/stores/server-connection-status.test.ts` 的 describe 内追加：

```ts
  it('maps UserMismatch to the add-as-new-server guidance', () => {
    expect(connectionErrorMessage(new AppError('UserMismatch', 'mismatch'))).toBe(
      '该账号不是此服务器配置的用户。如需使用其他账号，请作为新服务器添加。',
    )
    expect(connectionErrorMessage({ code: 'UserMismatch', message: 'mismatch' })).toBe(
      USER_MISMATCH_MESSAGE,
    )
  })
```

并把该文件导入改为：

```ts
import {
  connectionErrorMessage,
  isAbortError,
  USER_MISMATCH_MESSAGE,
} from './server-connection-status'
```

创建 `apps/desktop/src/views/reauth-error-message.test.ts`：

```ts
import { AppError } from '@lumaroute/core'
import { describe, expect, it } from 'vitest'
import { reauthErrorMessage } from './reauth-error-message'

describe('reauthErrorMessage', () => {
  it.each([
    [
      new AppError('UserMismatch', 'The account does not match this server profile'),
      '该账号不是此服务器配置的用户。如需使用其他账号，请作为新服务器添加。',
    ],
    [
      new AppError('AuthenticationExpired', 'Server credential was rejected'),
      '密码错误或账号不可用。请确认服务端的新密码后重试。',
    ],
    [
      { code: 'ServerMismatch', message: 'The line belongs to a different server' },
      '线路返回的服务器与此配置不一致，未保存新凭证。',
    ],
    [new AppError('LineTimeout', 'Request timed out'), '连接超时。请检查线路与网络后重试。'],
  ])('maps reauthentication failure %#', (error, expected) => {
    expect(reauthErrorMessage(error)).toBe(expected)
  })
})
```

- [ ] **Step 2: 写失败的 store 测试**

`apps/desktop/src/stores/media-store.test.ts` 追加：

```ts
  it('resets a server connection entry back to unknown', async () => {
    const harness = createMediaStoreHarness({
      getLibraries: vi.fn().mockRejectedValue(new AppError('AuthenticationExpired', 'rejected')),
    })
    await harness.withStore(async (store) => {
      await store.loadHome('profile-1')
      expect(store.connectionStatus('profile-1')).toBe('unhealthy')
      store.resetConnection('profile-1')
      expect(store.connectionStatus('profile-1')).toBe('unknown')
      expect(store.connectionError('profile-1')).toBeNull()
    })
  })
```

`apps/desktop/src/stores/server-store.test.ts`：

1. 导入区追加：

```ts
import { AppError } from '@lumaroute/core'
import { useMediaStore } from './media-store'
```

2. describe 内追加：

```ts
  it('re-authenticates with the device identity and reloads the active server home', async () => {
    const reauthenticate = vi.fn().mockResolvedValue({ id: 'profile-2' })
    const media = {
      getLibraries: vi.fn().mockResolvedValue({ value: [], lineId: 'line-1' }),
      getContinueWatching: vi.fn().mockResolvedValue({ value: [], lineId: 'line-1' }),
    }
    const services = {
      deviceIdentity: { getOrCreate },
      login: { reauthenticate },
      media,
    } as unknown as AppServices

    await withServices(services, async (store) => {
      await store.reauthenticate('profile-2', 'new-password')
      expect(reauthenticate).toHaveBeenCalledWith({
        profileId: 'profile-2',
        password: 'new-password',
        deviceId: 'device-1',
        appVersion: '0.1.0',
      })
      expect(media.getLibraries).toHaveBeenCalledWith('profile-2', expect.any(AbortSignal))
      expect(useMediaStore().connectionStatus('profile-2')).toBe('healthy')
    })
  })

  it('clears the stale error of a non-active server without loading its home', async () => {
    activeServerId.value = 'profile-1'
    const media = {
      getLibraries: vi
        .fn()
        .mockRejectedValueOnce(new AppError('AuthenticationExpired', 'rejected')),
      getContinueWatching: vi.fn().mockResolvedValue({ value: [], lineId: 'line-1' }),
    }
    const services = {
      deviceIdentity: { getOrCreate },
      login: { reauthenticate: vi.fn().mockResolvedValue({ id: 'profile-2' }) },
      media,
    } as unknown as AppServices

    await withServices(services, async (store) => {
      const mediaStore = useMediaStore()
      await mediaStore.loadHome('profile-2')
      expect(mediaStore.connectionStatus('profile-2')).toBe('unhealthy')
      await store.reauthenticate('profile-2', 'new-password')
      expect(media.getLibraries).toHaveBeenCalledOnce()
      expect(mediaStore.connectionStatus('profile-2')).toBe('unknown')
    })
  })

  it('propagates a UserMismatch rejection to the caller', async () => {
    const services = {
      deviceIdentity: { getOrCreate },
      login: {
        reauthenticate: vi.fn().mockRejectedValue(new AppError('UserMismatch', 'mismatch')),
      },
    } as unknown as AppServices
    await withServices(services, async (store) => {
      await expect(store.reauthenticate('profile-2', 'pw')).rejects.toMatchObject({
        code: 'UserMismatch',
      })
    })
  })
```

- [ ] **Step 3: 写失败的路由注入与账号区块测试**

`apps/desktop/src/router/index.test.ts` 的 `describe('settingsProps')` 内追加：

```ts
  it('opens the account form only when routed with reauth=1', () => {
    expect(settingsProps().reauthOpen).toBe(false)
    expect(settingsProps({ query: { reauth: '1' } }).reauthOpen).toBe(true)
  })

  it('delegates re-authentication to the server store', async () => {
    const store = useServerStore()
    const reauthenticate = vi.spyOn(store, 'reauthenticate').mockResolvedValue(undefined)
    await settingsProps().reauthenticate('profile-1', 'new-password')
    expect(reauthenticate).toHaveBeenCalledWith('profile-1', 'new-password')
  })
```

`apps/desktop/src/views/ServerSettingsView.test.ts`：

1. 顶部追加 `import { AppError } from '@lumaroute/core'`（与现有 `import type { ServerProfile }` 合并为 `import { AppError, type ServerProfile } from '@lumaroute/core'`）。
2. `mountSettings` 的 options 类型追加：

```ts
  reauthenticate?: ReturnType<typeof vi.fn>
  reauthOpen?: boolean
```

函数体内追加 `const reauthenticate = options.reauthenticate ?? vi.fn().mockResolvedValue(undefined)`，props 追加：

```ts
      reauthOpen: options.reauthOpen ?? false,
      reauthenticate: reauthenticate as (profileId: string, password: string) => Promise<void>,
```

返回对象追加 `reauthenticate,`。

3. 追加用例：

```ts
  it('re-authenticates the configured account and clears the password', async () => {
    const { wrapper, reauthenticate } = mountSettings({ profiles: [profileOne] })
    expect(wrapper.get('[data-testid="account-username"]').text()).toBe('alice')
    expect(wrapper.find('input[name="reauth-username"]').exists()).toBe(false)
    expect(wrapper.find('input[name="reauth-password"]').exists()).toBe(false)
    await wrapper.get('[data-testid="reauth-open"]').trigger('click')
    const password = wrapper.get('input[name="reauth-password"]')
    await password.setValue('new-password')
    await wrapper.get('[data-testid="reauth-form"]').trigger('submit')
    expect((password.element as HTMLInputElement).value).toBe('')
    await flushPromises()
    expect(reauthenticate).toHaveBeenCalledWith('profile-1', 'new-password')
    expect(wrapper.get('[data-testid="reauth-status"]').text()).toBe('已重新登录')
    expect(wrapper.find('input[name="reauth-password"]').exists()).toBe(false)
  })

  it('shows mapped guidance and clears the password when the account does not match', async () => {
    const { wrapper } = mountSettings({
      profiles: [profileOne],
      reauthenticate: vi
        .fn()
        .mockRejectedValue(new AppError('UserMismatch', 'The account does not match this server profile')),
    })
    await wrapper.get('[data-testid="reauth-open"]').trigger('click')
    await wrapper.get('input[name="reauth-password"]').setValue('other-password')
    await wrapper.get('[data-testid="reauth-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="reauth-error"]').text()).toBe(
      '该账号不是此服务器配置的用户。如需使用其他账号，请作为新服务器添加。',
    )
    expect(
      (wrapper.get('input[name="reauth-password"]').element as HTMLInputElement).value,
    ).toBe('')
    expect(wrapper.find('[data-testid="reauth-status"]').exists()).toBe(false)
  })

  it('opens the account form directly when routed from an expired credential', () => {
    const { wrapper } = mountSettings({ profiles: [profileOne], reauthOpen: true })
    expect(wrapper.find('input[name="reauth-password"]').exists()).toBe(true)
  })

  it('cancels re-login and discards the typed password', async () => {
    const { wrapper, reauthenticate } = mountSettings({ profiles: [profileOne] })
    await wrapper.get('[data-testid="reauth-open"]').trigger('click')
    await wrapper.get('input[name="reauth-password"]').setValue('typed')
    await wrapper.get('[data-testid="reauth-cancel"]').trigger('click')
    expect(wrapper.find('input[name="reauth-password"]').exists()).toBe(false)
    await wrapper.get('[data-testid="reauth-open"]').trigger('click')
    expect(
      (wrapper.get('input[name="reauth-password"]').element as HTMLInputElement).value,
    ).toBe('')
    expect(reauthenticate).not.toHaveBeenCalled()
  })
```

- [ ] **Step 4: 运行测试确认红灯**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src/stores/server-connection-status.test.ts apps/desktop/src/views/reauth-error-message.test.ts apps/desktop/src/stores/media-store.test.ts apps/desktop/src/stores/server-store.test.ts apps/desktop/src/router/index.test.ts apps/desktop/src/views/ServerSettingsView.test.ts`

Expected: FAIL —— `USER_MISMATCH_MESSAGE`、`reauth-error-message` 模块、`resetConnection`、`serverStore.reauthenticate`、`settingsProps().reauthOpen` 与账号区块均不存在。

- [ ] **Step 5: 实现错误映射**

在 `apps/desktop/src/stores/server-connection-status.ts`：

1. `isAbortError` 之前加入：

```ts
export const USER_MISMATCH_MESSAGE =
  '该账号不是此服务器配置的用户。如需使用其他账号，请作为新服务器添加。'
```

2. `connectionErrorMessage` 函数体内 `const detail = errorText(error)` 之后、`if (error instanceof AppError)` 之前加入：

```ts
  if (code === 'UserMismatch') return USER_MISMATCH_MESSAGE
```

创建 `apps/desktop/src/views/reauth-error-message.ts`：

```ts
import { connectionErrorMessage } from '../stores/server-connection-status'

/** Map re-login failures to Chinese UI copy; never includes the submitted password. */
export function reauthErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined
  if (code === 'AuthenticationExpired') {
    return '密码错误或账号不可用。请确认服务端的新密码后重试。'
  }
  if (code === 'ServerMismatch') {
    return '线路返回的服务器与此配置不一致，未保存新凭证。'
  }
  return connectionErrorMessage(error)
}
```

- [ ] **Step 6: 实现 store**

在 `apps/desktop/src/stores/media-store.ts` 的 `setConnection` 之后加入：

```ts
  function resetConnection(profileId: string): void {
    const next = { ...connections.value }
    delete next[profileId]
    connections.value = next
  }
```

并在返回对象的 `connectionError,` 之后加入 `resetConnection,`。

在 `apps/desktop/src/stores/server-store.ts`：

1. 导入追加 `import { useMediaStore } from './media-store'`。
2. `renameServer` 之后加入：

```ts
  async function reauthenticate(profileId: string, password: string): Promise<void> {
    const services = injectServices()
    const deviceId = await services.deviceIdentity.getOrCreate()
    await services.login.reauthenticate({ profileId, password, deviceId, appVersion: '0.1.0' })
    const media = useMediaStore()
    if (useAppStore().activeServerId === profileId) await media.loadHome(profileId)
    else media.resetConnection(profileId)
  }
```

3. 返回对象的 `renameServer,` 之后加入 `reauthenticate,`。

- [ ] **Step 7: 路由注入**

在 `apps/desktop/src/router/index.ts`：

1. `export function settingsProps() {` 改为：

```ts
export function settingsProps(route?: Pick<RouteLocationNormalizedLoaded, 'query'>) {
```

2. 返回对象的 `activeServerId: activeId,` 之后加入：

```ts
    reauthOpen: route?.query.reauth === '1',
    reauthenticate: (profileId: string, password: string) =>
      serverStore.reauthenticate(profileId, password),
```

设置路由记录保持 `props: settingsProps`（vue-router 以当前路由调用它）。

- [ ] **Step 8: 实现设置页账号区块**

在 `ServerSettingsView.vue` `<script setup>`：

1. 导入追加 `import { reauthErrorMessage } from './reauth-error-message'`。
2. `defineProps` 类型追加：

```ts
  reauthOpen?: boolean
  reauthenticate?: (profileId: string, password: string) => Promise<void>
```

3. 在 Task 2 加入的 `lineRenameError` 声明之后加入：

```ts
const reauthExpanded = ref(props.reauthOpen ?? false)
const reauthPassword = ref('')
const reauthSubmitting = ref(false)
const reauthStatus = ref<string | null>(null)
const reauthError = ref<string | null>(null)

function openReauth(): void {
  reauthExpanded.value = true
  reauthStatus.value = null
  reauthError.value = null
}

function resetReauth(): void {
  reauthExpanded.value = false
  reauthPassword.value = ''
  reauthStatus.value = null
  reauthError.value = null
}

async function submitReauth(): Promise<void> {
  const password = reauthPassword.value
  reauthPassword.value = ''
  if (!props.reauthenticate || !password) return
  reauthSubmitting.value = true
  reauthStatus.value = null
  reauthError.value = null
  try {
    await props.reauthenticate(props.profile.id, password)
    reauthExpanded.value = false
    reauthStatus.value = '已重新登录'
  } catch (error) {
    reauthError.value = reauthErrorMessage(error)
  } finally {
    reauthSubmitting.value = false
  }
}
```

4. 现有 `watch(() => [props.profile.id, props.profile.preferredLineId] as const, …)` 的回调中，把

```ts
    if (profileId !== previousProfileId) draftName.value = props.profile.name
```

替换为

```ts
    if (profileId !== previousProfileId) {
      draftName.value = props.profile.name
      resetReauth()
    }
```

5. 在该 watch 之后加入：

```ts
watch(
  () => props.reauthOpen,
  (open) => {
    if (open) openReauth()
  },
)
```

模板中，在 `<section class="panel active-profile">…</section>` 之后插入：

```vue
    <section
      id="account"
      class="panel account"
      data-testid="account-section"
      aria-labelledby="account-heading"
    >
      <h2 id="account-heading">
        账号
      </h2>
      <p class="account-user">
        <span class="lr-muted">用户名</span>
        <strong data-testid="account-username">{{ profile.username }}</strong>
      </p>
      <button
        v-if="!reauthExpanded"
        type="button"
        class="lr-btn-secondary lr-btn-sm account-action"
        data-testid="reauth-open"
        :disabled="!reauthenticate"
        @click="openReauth"
      >
        重新登录
      </button>
      <form
        v-else
        class="reauth-form"
        data-testid="reauth-form"
        @submit.prevent="submitReauth"
      >
        <label class="lr-field">
          <span>密码</span>
          <input
            v-model="reauthPassword"
            name="reauth-password"
            type="password"
            autocomplete="current-password"
            required
          >
        </label>
        <div class="confirm-actions">
          <button
            type="submit"
            class="lr-btn-primary lr-btn-sm"
            data-testid="reauth-submit"
            :disabled="reauthSubmitting"
          >
            {{ reauthSubmitting ? '登录中…' : '登录' }}
          </button>
          <button
            type="button"
            class="lr-btn-secondary lr-btn-sm"
            data-testid="reauth-cancel"
            :disabled="reauthSubmitting"
            @click="resetReauth"
          >
            取消
          </button>
        </div>
      </form>
      <p
        v-if="reauthStatus"
        class="reauth-status"
        role="status"
        data-testid="reauth-status"
      >
        {{ reauthStatus }}
      </p>
      <p
        v-if="reauthError"
        class="lr-alert lr-alert-danger"
        role="alert"
        data-testid="reauth-error"
      >
        {{ reauthError }}
      </p>
    </section>
```

`<style scoped>` 追加：

```css
.account-user {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
  margin: 0;
}

.account-action {
  justify-self: start;
}

.reauth-form {
  display: grid;
  gap: 0.65rem;
  max-width: 22rem;
}

.reauth-status {
  margin: 0;
  color: var(--lr-success);
  font-size: var(--lr-font-sm);
}
```

注意：`cancelReauth` 行为由 `resetReauth` 承担（折叠、清空密码与提示），测试中的 `reauth-cancel` 调用它。

- [ ] **Step 9: 运行测试确认绿灯**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src/stores apps/desktop/src/views/reauth-error-message.test.ts apps/desktop/src/router/index.test.ts apps/desktop/src/views/ServerSettingsView.test.ts`

Expected: PASS。

- [ ] **Step 10: 类型检查、全量质量门并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck && pnpm check && git diff --check`

Expected: 全部 PASS；`git diff --check` 无输出。

```bash
git add apps/desktop/src/views/reauth-error-message.ts apps/desktop/src/views/reauth-error-message.test.ts apps/desktop/src/stores/server-connection-status.ts apps/desktop/src/stores/server-connection-status.test.ts apps/desktop/src/stores/media-store.ts apps/desktop/src/stores/media-store.test.ts apps/desktop/src/stores/server-store.ts apps/desktop/src/stores/server-store.test.ts apps/desktop/src/router/index.ts apps/desktop/src/router/index.test.ts apps/desktop/src/views/ServerSettingsView.vue apps/desktop/src/views/ServerSettingsView.test.ts
git commit -m "feat: re-login from the settings account block"
```

## Task 7: 凭证失效时的「重新登录」入口（首页与侧栏）

**Files:**

- Modify: `apps/desktop/src/stores/server-connection-status.ts`
- Modify: `apps/desktop/src/stores/server-connection-status.test.ts`
- Modify: `apps/desktop/src/stores/media-store.ts`
- Modify: `apps/desktop/src/stores/media-store.test.ts`
- Modify: `apps/desktop/src/views/HomeView.vue`
- Modify: `apps/desktop/src/views/HomeView.test.ts`
- Modify: `apps/desktop/src/components/ServerSwitcher.vue`
- Modify: `apps/desktop/src/components/ServerSwitcher.test.ts`
- Modify: `apps/desktop/src/components/AppShell.vue`
- Modify: `apps/desktop/src/components/AppShell.test.ts`

**Interfaces:**

- Consumes: Task 6 设置页 `reauthOpen` 由 `{ name: 'settings', query: { reauth: '1' } }` 打开；Task 3 `AppShell.test` 命名路由 `settings`。
- Produces: `isAuthenticationExpired(error)`；连接条目新增 `needsReauth`；`mediaStore.connectionNeedsReauth(profileId)`；首页 `data-testid="home-reauth"`；侧栏 `data-testid="server-reauth-<profileId>"` 与 emit `reauth`；非活动服务器先切换再进入设置页（设置页只展示活动 Profile）。

- [ ] **Step 1: 写失败的判定与 store 测试**

`server-connection-status.test.ts`：导入追加 `isAuthenticationExpired`，describe 内追加：

```ts
  it('detects expired credentials from AppError and plain IPC rejections', () => {
    expect(isAuthenticationExpired(new AppError('AuthenticationExpired', 'rejected'))).toBe(true)
    expect(isAuthenticationExpired({ code: 'AuthenticationExpired' })).toBe(true)
    expect(isAuthenticationExpired(new AppError('NetworkUnavailable', 'down'))).toBe(false)
  })
```

`media-store.test.ts` 追加：

```ts
  it('flags a server for re-login only when its credential expired', async () => {
    const expired = createMediaStoreHarness({
      getLibraries: vi.fn().mockRejectedValue(new AppError('AuthenticationExpired', 'rejected')),
    })
    await expired.withStore(async (store) => {
      await store.loadHome('profile-1')
      expect(store.connectionNeedsReauth('profile-1')).toBe(true)
    })

    const offline = createMediaStoreHarness({
      getLibraries: vi.fn().mockRejectedValue(new AppError('NetworkUnavailable', 'down')),
    })
    await offline.withStore(async (store) => {
      await store.loadHome('profile-1')
      expect(store.connectionStatus('profile-1')).toBe('unhealthy')
      expect(store.connectionNeedsReauth('profile-1')).toBe(false)
    })
  })
```

- [ ] **Step 2: 写失败的首页/侧栏/Shell 测试**

`HomeView.test.ts`：

1. 导入改为 `import { AppError, type Library, type MediaItem, type ServerProfile } from '@lumaroute/core'`。
2. `mountHome` 路由表追加 `{ path: '/settings', name: 'settings', component: { template: '<div />' } },`。
3. 追加用例：

```ts
  it('offers re-login from the home error when the credential expired', async () => {
    const { wrapper, media, withStore } = mountHome({ activeServerId: 'profile-1' })
    media.getLibraries.mockRejectedValueOnce(
      new AppError('AuthenticationExpired', 'Server credential was rejected'),
    )
    await withStore((store) => store.loadHome('profile-1'))
    await flushPromises()
    expect(wrapper.get('[data-testid="home-error"]').text()).toMatch(/凭证/)
    const link = wrapper.get('[data-testid="home-reauth"]')
    expect(link.text()).toBe('重新登录')
    expect(link.attributes('href')).toBe('/settings?reauth=1')
  })

  it('keeps plain retry guidance for network failures', async () => {
    const { wrapper, media, withStore } = mountHome({ activeServerId: 'profile-1' })
    media.getLibraries.mockRejectedValueOnce(new AppError('NetworkUnavailable', 'down'))
    await withStore((store) => store.loadHome('profile-1'))
    await flushPromises()
    expect(wrapper.find('[data-testid="home-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="home-reauth"]').exists()).toBe(false)
  })
```

`ServerSwitcher.test.ts` 追加：

```ts
  it('offers re-login only for an unhealthy server whose credential expired', async () => {
    const wrapper = mount(ServerSwitcher, {
      props: {
        profiles,
        activeId: 'profile-1',
        statusById: { 'profile-1': 'unhealthy' },
        needsReauthById: { 'profile-1': true },
      },
    })
    const reauth = wrapper.get('[data-testid="server-reauth-profile-1"]')
    expect(reauth.text()).toBe('重新登录')
    await reauth.trigger('click')
    expect(wrapper.emitted('reauth')).toEqual([['profile-1']])
    expect(wrapper.emitted('select')).toBeUndefined()

    const offline = mountSwitcher({ statusById: { 'profile-1': 'unhealthy' } })
    expect(offline.find('[data-testid="server-reauth-profile-1"]').exists()).toBe(false)
  })
```

`AppShell.test.ts`：导入改为 `import { AppError, type Library, type MediaItem, type ServerProfile } from '@lumaroute/core'`，追加：

```ts
  it('routes an expired credential from the sidebar to the settings account block', async () => {
    const { wrapper, app, services, router } = await mountPopulatedShell()
    vi.mocked(services.media.getLibraries).mockRejectedValueOnce(
      new AppError('AuthenticationExpired', 'Server credential was rejected'),
    )
    await app.runWithContext(async () => {
      await useMediaStore().loadHome(profile.id)
    })
    await flushPromises()
    await wrapper.get('[data-testid="server-reauth-profile-1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/settings?reauth=1')
    wrapper.unmount()
  })
```

- [ ] **Step 3: 运行测试确认红灯**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src/stores/server-connection-status.test.ts apps/desktop/src/stores/media-store.test.ts apps/desktop/src/views/HomeView.test.ts apps/desktop/src/components/ServerSwitcher.test.ts apps/desktop/src/components/AppShell.test.ts`

Expected: FAIL —— `isAuthenticationExpired`、`connectionNeedsReauth`、`home-reauth`、`server-reauth-profile-1` 不存在。

- [ ] **Step 4: 实现判定与 needsReauth**

`server-connection-status.ts` 在 `connectionErrorMessage` 之前加入：

```ts
export function isAuthenticationExpired(error: unknown): boolean {
  return errorField(error, 'code') === 'AuthenticationExpired'
}
```

`media-store.ts`：

1. 导入改为：

```ts
import {
  connectionErrorMessage,
  isAbortError,
  isAuthenticationExpired,
  type ServerConnectionStatus,
} from './server-connection-status'
```

2. `ConnectionEntry` 改为：

```ts
type ConnectionEntry = {
  status: ServerConnectionStatus
  error: string | null
  needsReauth: boolean
}
```

3. `connectionError` 之后加入：

```ts
  function connectionNeedsReauth(profileId: string): boolean {
    return connections.value[profileId]?.needsReauth ?? false
  }
```

4. `loadHome` 中三处 `setConnection` 改为：

```ts
    setConnection(serverId, { status: 'checking', error: null, needsReauth: false })
```

```ts
      setConnection(serverId, { status: 'healthy', error: null, needsReauth: false })
```

```ts
      setConnection(serverId, {
        status: 'unhealthy',
        error: connectionErrorMessage(error),
        needsReauth: isAuthenticationExpired(error),
      })
```

5. 返回对象 `connectionError,` 之后加入 `connectionNeedsReauth,`。

- [ ] **Step 5: 实现首页入口**

`HomeView.vue` `<script setup>` 在 `errorMessage` 之后加入：

```ts
const needsReauth = computed(() =>
  activeServerId.value ? mediaStore.connectionNeedsReauth(activeServerId.value) : false,
)
```

模板中把

```vue
      <p
        v-else-if="status === 'unhealthy'"
        class="home-error home-status"
        data-testid="home-error"
      >
        {{ errorMessage ?? '加载失败，请使用侧栏重试。' }}
      </p>
```

替换为

```vue
      <div
        v-else-if="status === 'unhealthy'"
        class="home-error home-status"
        data-testid="home-error"
        role="alert"
      >
        <p>{{ errorMessage ?? '加载失败，请使用侧栏重试。' }}</p>
        <RouterLink
          v-if="needsReauth"
          class="lr-btn-secondary lr-btn-sm home-reauth"
          data-testid="home-reauth"
          :to="{ name: 'settings', query: { reauth: '1' } }"
        >
          重新登录
        </RouterLink>
      </div>
```

`<style scoped>` 追加：

```css
.home-error {
  display: grid;
  gap: 0.6rem;
}

.home-error p {
  margin: 0;
}

.home-reauth {
  justify-self: start;
}
```

- [ ] **Step 6: 实现侧栏入口与 Shell 导航**

`ServerSwitcher.vue`：

1. `defineProps` 追加 `needsReauthById?: Readonly<Record<string, boolean>>`。
2. `defineEmits` 追加 `reauth: [profileId: string]`。
3. 在「重试」按钮之后插入：

```vue
          <button
            v-if="statusFor(profile.id) === 'unhealthy' && needsReauthById?.[profile.id]"
            type="button"
            class="retry-button"
            :data-testid="`server-reauth-${profile.id}`"
            :aria-label="`重新登录 ${profile.name}`"
            @click.stop="emit('reauth', profile.id)"
          >
            重新登录
          </button>
```

4. `.server-row` 的 `grid-template-columns: 1fr auto;` 改为 `grid-template-columns: 1fr auto auto;`。

`AppShell.vue`：

1. `statusById` 之后加入：

```ts
const needsReauthById = computed(() => {
  const map: Record<string, boolean> = {}
  for (const profile of serverStore.profiles) {
    map[profile.id] = mediaStore.connectionNeedsReauth(profile.id)
  }
  return map
})
```

2. `onAddServer` 之后加入：

```ts
async function onReauth(profileId: string): Promise<void> {
  if (appStore.activeServerId !== profileId) await appStore.selectServer(profileId)
  await router.push({ name: 'settings', query: { reauth: '1' } })
}
```

3. `<ServerSwitcher>` 追加 `:needs-reauth-by-id="needsReauthById"` 与 `@reauth="onReauth"`。

- [ ] **Step 7: 运行测试确认绿灯**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src/stores apps/desktop/src/views/HomeView.test.ts apps/desktop/src/components`

Expected: PASS；`LibrarySidebar` 凭证失败文案用例保持通过。

- [ ] **Step 8: 类型检查、全量质量门并提交**

Run: `pnpm --filter @lumaroute/desktop typecheck && pnpm check && git diff --check`

Expected: 全部 PASS；`git diff --check` 无输出。

```bash
git add apps/desktop/src/stores/server-connection-status.ts apps/desktop/src/stores/server-connection-status.test.ts apps/desktop/src/stores/media-store.ts apps/desktop/src/stores/media-store.test.ts apps/desktop/src/views/HomeView.vue apps/desktop/src/views/HomeView.test.ts apps/desktop/src/components/ServerSwitcher.vue apps/desktop/src/components/ServerSwitcher.test.ts apps/desktop/src/components/AppShell.vue apps/desktop/src/components/AppShell.test.ts
git commit -m "feat: offer re-login when a server credential expires"
```

## Task 8: E2E（添加服务器、重新登录、唯一搜索框）与全量验收

**Files:**

- Modify: `tests/integration/support/mock-media-server.ts`
- Modify: `tests/e2e/support/media-servers.ts`
- Create: `tests/e2e/server-management.spec.ts`
- Modify: `tests/e2e/browse-search-play.spec.ts`

**Interfaces:**

- Consumes: Task 1–7 的全部 `data-testid` 与路由；`tests/e2e/fixtures.ts` 的 `addServer`、`serverOne/serverTwo`、`mediaServers`（fixture 文件不改）。
- Produces: `Reply.requiredPassword?: string`；`LogicalServerFixture.changePassword(password: string, token: string): void`；mock 对全部授权路由校验 `X-Emby-Token`、对 `/Users/AuthenticateByName` 校验 `Pw`。

- [ ] **Step 1: 写失败的 E2E**

创建 `tests/e2e/server-management.spec.ts`：

```ts
import { expect, test, addServer } from './fixtures'

test('adds a second server from the sidebar and switches without restarting', async ({
  page,
  serverOne,
  serverTwo,
}) => {
  await addServer(page, serverOne)

  await page.getByTestId('add-server').click()
  await expect(page).toHaveURL(/\/onboarding\?mode=add$/)
  await page.getByTestId('onboarding-cancel').click()
  await expect(page.getByTestId('server-switcher')).toBeVisible()

  await page.getByTestId('add-server').click()
  await page.locator('select[name="kind"]').selectOption(serverTwo.kind)
  await page.locator('input[name="name"]').fill(serverTwo.name)
  await page.locator('input[name="baseUrl"]').fill(serverTwo.baseUrl)
  await page.locator('input[name="username"]').fill(serverTwo.username)
  await page.locator('input[name="password"]').fill(serverTwo.password)
  await page.getByRole('button', { name: '连接' }).click()

  const switcher = page.getByTestId('server-switcher')
  await expect(switcher.getByRole('button', { name: 'Server Two' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(page.locator('input[name="password"]')).toHaveCount(0)
  await switcher.getByRole('button', { name: 'Server One' }).click()
  await expect(switcher.getByRole('button', { name: 'Server One' })).toHaveAttribute(
    'aria-current',
    'true',
  )

  await page.getByRole('link', { name: '服务器设置' }).click()
  await expect(page.getByTestId('line-list')).toContainText('主线路')
  await expect(page.getByTestId('line-list')).not.toContainText('Primary')
})

test('re-authenticates after the server password changes', async ({
  page,
  serverOne,
  mediaServers,
}) => {
  await addServer(page, serverOne)
  mediaServers.serverOne.changePassword('rotated-password', 'token-one-rotated')

  await page.reload()
  await expect(page.getByTestId('home-error')).toBeVisible()
  await page.getByTestId('home-reauth').click()

  await expect(page.getByTestId('account-username')).toHaveText(serverOne.username)
  const password = page.locator('input[name="reauth-password"]')
  await password.fill(serverOne.password)
  await page.getByTestId('reauth-submit').click()
  await expect(page.getByTestId('reauth-error')).toHaveText(
    '密码错误或账号不可用。请确认服务端的新密码后重试。',
  )
  await expect(password).toHaveValue('')

  await password.fill('rotated-password')
  await page.getByTestId('reauth-submit').click()
  await expect(page.getByTestId('reauth-status')).toHaveText('已重新登录')
  await expect(password).toHaveCount(0)
  await expect(page.getByTestId('library-movies')).toBeVisible()
  expect(await page.content()).not.toContain('token-one-rotated')
})
```

在 `tests/e2e/browse-search-play.spec.ts` 末尾追加：

```ts
test('keeps the top bar as the only search input', async ({ page, seedAuthenticatedProfiles }) => {
  await seedAuthenticatedProfiles(page)
  const search = page.getByTestId('current-server-search')

  await search.fill('Arrival')
  await expect(page).toHaveURL(/\/search\?q=Arrival/)
  await expect(page.getByRole('searchbox')).toHaveCount(1)
  await expect(page.getByTestId('media-card').filter({ hasText: 'Arrival' })).toBeVisible()

  await search.fill('')
  await expect(page.getByTestId('search-empty')).toHaveText('在顶部搜索框输入关键词（⌘K / Ctrl+K）')
  await expect(page.getByRole('searchbox')).toHaveCount(1)
})
```

- [ ] **Step 2: 运行 E2E 确认红灯**

Run: `pnpm exec playwright test tests/e2e/server-management.spec.ts`

Expected: 「re-authenticates…」FAIL，运行时 `TypeError: mediaServers.serverOne.changePassword is not a function`（mock 尚未提供；Playwright 不做类型检查）。「adds a second server…」在 Task 1–7 完成后应已 PASS；若它失败，说明前序任务的 testid/路由与本计划不一致，先回到对应任务修正，不在 E2E 中放宽选择器。

- [ ] **Step 3: mock 服务端校验密码**

在 `tests/integration/support/mock-media-server.ts`：

1. `Reply` 类型在 `requiredToken?: string` 之后加入 `requiredPassword?: string`。
2. 在 `if (reply.requiredToken && …) { … return }` 块之后加入：

```ts
      if (reply.requiredPassword !== undefined) {
        const submitted =
          body && typeof body === 'object' ? (body as { Pw?: unknown }).Pw : undefined
        if (submitted !== reply.requiredPassword) {
          response.statusCode = 401
          response.setHeader('content-type', 'application/json')
          response.end(JSON.stringify({ message: 'invalid credentials' }))
          return
        }
      }
```

- [ ] **Step 4: E2E 逻辑服务器支持改密与严格 Token**

在 `tests/e2e/support/media-servers.ts`：

1. `LogicalServerFixture` 追加 `changePassword(password: string, token: string): void`。
2. `installJellyfinSurface` 的 `options` 追加 `password: string`，函数体替换为：

```ts
  const baseItems = loadJson('jellyfin/items.json') as { Items: Record<string, unknown>[] }
  const allItems = [...baseItems.Items, ...options.extraItems]
  const itemsFixture = { Items: allItems, TotalRecordCount: allItems.length }
  const librariesFixture = loadJson('jellyfin/libraries.json')
  const playbackInfoFixture = loadJson('jellyfin/playback-info.json')
  const requiredToken = options.token

  server.reply('/System/Info/Public', {
    status: 200,
    body: { Id: options.serverId, ServerName: options.serverName },
  })
  server.reply('/System/Info', {
    status: 200,
    body: { Id: options.serverId, ServerName: options.serverName },
    requiredToken,
  })
  server.reply('/Users/AuthenticateByName', {
    status: 200,
    body: {
      AccessToken: options.token,
      ServerId: options.serverId,
      User: { Id: options.userId, Name: options.username },
    },
    requiredPassword: options.password,
  })
  server.reply('/Library/VirtualFolders', { status: 200, body: librariesFixture, requiredToken })
  server.reply(`/Users/${options.userId}/Items`, {
    status: 200,
    body: itemsFixture,
    filterBySearchTerm: true,
    requiredToken,
  })
  server.reply(`/Users/${options.userId}/Items/Resume`, {
    status: 200,
    body: { Items: [], TotalRecordCount: 0 },
    requiredToken,
  })
  server.reply('/Items/*/PlaybackInfo', { status: 200, body: playbackInfoFixture, requiredToken })
  server.reply('/Items/*/Images/Primary', {
    status: 200,
    bytes: POSTER_PNG,
    contentType: 'image/png',
    requiredToken,
  })
  server.reply('/Sessions/Playing', { status: 204, body: {}, requiredToken })
  server.reply('/Sessions/Playing/Progress', { status: 204, body: {}, requiredToken })
  server.reply('/Sessions/Playing/Stopped', { status: 204, body: {}, requiredToken })
```

3. `createLogicalServer` 函数体替换为：

```ts
  const primary = await mockServer()
  const backup = await mockServer()
  const username = 'alice'
  const password = 'test-password'
  const install = (nextPassword: string, token: string): void => {
    for (const server of [primary, backup]) {
      installJellyfinSurface(server, {
        serverId: input.serverId,
        serverName: input.name,
        userId: input.userId,
        token,
        username,
        password: nextPassword,
        extraItems: input.extraItems ?? [],
      })
    }
  }
  install(password, input.token)
  return {
    name: input.name,
    serverId: input.serverId,
    username,
    password,
    primary,
    backup,
    changePassword: install,
  }
```

- [ ] **Step 5: 运行全部 E2E 确认绿灯**

Run: `pnpm exec playwright test`

Expected: PASS —— `onboarding.spec.ts`、`browse-search-play.spec.ts`（含 Aurora、跨服搜索隔离、唯一搜索框）、`server-management.spec.ts`（侧栏添加 + 切换、改密重新登录）全部通过；严格 Token 校验下原有浏览/播放/进度用例不回归。

- [ ] **Step 6: 运行集成测试确认 mock 变更兼容**

Run: `pnpm test:integration`

Expected: PASS；`requiredPassword` 为可选字段，现有集成用例不受影响（若本机无 Docker，Jellyfin 容器用例按其既有 skip 逻辑跳过，记录在执行记录中）。

- [ ] **Step 7: 全量质量门**

Run: `pnpm vitest run --config vitest.workspace.ts apps/desktop/src packages/core/src`

Expected: PASS。

Run: `pnpm check`

Expected: PASS；ESLint 0 warnings、全 workspace typecheck、Vitest/Rust/boundaries/sensitive/mpv 全部通过。

Run: `git diff --check`

Expected: 无输出，退出码 0。

- [ ] **Step 8: 人工实机验收（不替代自动化）**

Run: `pnpm dev`

Expected:

- 任意页面只有顶栏一个搜索框；`⌘K/Ctrl+K` 聚焦它。
- 新添加服务器的线路显示「主线路」，可在设置页重命名；首页不再出现「当前连接」。
- 删除最后一台服务器后回到引导页，无占位服务器、无控制台未处理异常。
- 侧栏 `+` 与设置页「添加服务器」都能在不重启的情况下添加第二台服务器；添加模式可取消返回。
- 在服务端修改密码后，首页/侧栏出现「重新登录」，设置页账号区块用新密码登录成功并恢复首页；用另一账号登录时显示「该账号不是此服务器配置的用户。如需使用其他账号，请作为新服务器添加。」。

- [ ] **Step 9: 提交验收测试**

```bash
git add tests/integration/support/mock-media-server.ts tests/e2e/support/media-servers.ts tests/e2e/server-management.spec.ts tests/e2e/browse-search-play.spec.ts
git commit -m "test: cover add-server, re-login and single search end to end"
```

## 执行记录

### 开工前控制器决策（2026-09-23）

- 错误映射：`UserMismatch` 只加入 `connectionErrorMessage`，另建 `reauthErrorMessage`；core `userActionFor` 保持默认。
- 计划自拟的文案与 testid（重新登录失败、ServerId 不一致、线路名称为空、添加模式副标题、`settings-add-server`、`home-reauth`、`server-reauth-*`、`reauth-*`）按本计划执行。
- 跳转账号区块统一用 `{ name: 'settings', query: { reauth: '1' } }`；非当前服务器先切换。
- 无服务器时 `settingsProps` 返回 `profile: null`，由 AppShell `RouterView` 门控保证不渲染设置页；视图 prop 保持非空。
- `/onboarding` 不带 `mode` 仍可进入；仅 `mode=add` 且已有服务器时显示「取消」。线路名称空白只在界面校验。
- **追加到 Task 6：** `serverStore.reauthenticate` 成功后，除 `mediaStore.resetConnection` 与重载首页外，还必须让该服务器的全部 TanStack 查询失效重取：`services.queryClient.invalidateQueries({ predicate: (query) => query.queryKey.includes(profileId) })`（按实际 `mediaKeys` 结构调整谓词；`QueryClientPort` 如需补 `invalidateQueries` 签名一并加上），并用单测断言只失效该服务器的查询。
- E2E mock 变严格（校验 Token 与密码）可接受，但现有全部 E2E 必须继续通过。
- 暂不处理：`requireActiveServerId` 的 `'missing'` 占位、`main.ts` 重复跳转、引导页英文错误文案。
- spec §3「分页」措辞改为「现有取数行为」（`SearchView` 当前固定取 40 条，无分页）。

### 实施记录

实施期间对执行细节的调整、清单外文件（例如为 `.vue` 补充 ESLint globals）与本机环境导致的跳过项，按上一计划格式逐条追加到本节；不得借此改变上文范围。

## Plan Author Self-Review Record

**1. Spec coverage（设计章节 → 任务）**

- §1/§3 搜索只保留顶栏输入、无关键词空态、标题格式、防抖/切服取消不变 → Task 1（单测）+ Task 8（E2E「唯一搜索框」）。
- §4 `addServer.lineLabel`、「主线路」、引导页「线路名称」、设置页重命名（空白拒绝、不改其他字段）、已有 `Primary` 不迁移 → Task 2；首页删除「当前连接」与 `active-line` → Task 1；E2E 断言「主线路」→ Task 8。
- §5 无 Profile 守卫、删除最后一台跳引导页、`settingsProps` 去占位、设置页仅在真实 Profile 时渲染（`RouterView` 门控）→ Task 3。
- §6 侧栏 `+`（`add-server`/「添加服务器」）、设置页按钮、`/onboarding?mode=add`、添加模式取消/首次无取消、成功后设为当前并进首页 → Task 4；无需重启 → Task 8 E2E。
- §7.1 `ReauthenticateInput`、Profile 不存在 `StorageFailure`、使用 Profile 用户名、`orderLines`+`canFailOver`、401 不换线、不写粘滞、ServerId/UserId 校验、同 `credentialKey` 覆盖、返回原 Profile、`UserMismatch` 错误码 → Task 5；中文提示纳入集中映射 → Task 6（`connectionErrorMessage` + `reauthErrorMessage`）；脱敏 → Task 5 密码不回显测试（`redact` 已覆盖 `password` 键，无需改动）。
- §7.2 `serverStore.reauthenticate` 清除错误并重载首页、账号区块（只读用户名、展开密码/登录/取消、提交后清空、成功「已重新登录」、失败映射中文）→ Task 6；首页错误态与侧栏状态「重新登录」→ Task 7。
- §8 安全：密码仅局部状态并在提交时清空（Task 2/6 测试）、Token 不入 DOM（Task 8 `page.content()` 断言）、仅访问已配置线路（Task 5 禁用线路不尝试、无 URL 输入）。
- §9 测试清单逐项对应：core（Task 2/5）、桌面单测（Task 1/2/3/4/6/7）、E2E（Task 8）、质量门（每任务 + Task 8）。
- §10 验收 1–7 → Task 8 Step 5/7/8。

**2. Placeholder scan：** 无 TBD/TODO/“类似 Task N”；唯一非代码说明是 Task 3 Step 4 “原有 routes 数组逐字保留”，这是移动现有代码而非待补内容。

**3. Type consistency：** `lineLabel?: string`（Task 2）→ `OnboardingInput` 自动包含；`ReauthenticateInput`/`reauthenticate`（Task 5）→ `serverStore.reauthenticate(profileId, password)`（Task 6）→ `settingsProps().reauthenticate`（Task 6）→ `ServerSettingsView.reauthenticate` prop（Task 6）；`resetConnection`（Task 6）先于 `connectionNeedsReauth`/`needsReauth`（Task 7）引入，Task 7 未改 `resetConnection`；`onboardingProps(route, router)` 依赖 Task 3 的 `const router`；`AppShell.test` 命名路由 `onboarding/settings` 在 Task 3 引入，Task 4/7 复用；`RouterLinkStub` 在 Task 4 加入 `mountSettings`，Task 6 复用；设置页重新登录入口统一为 `{ name: 'settings', query: { reauth: '1' } }`（Task 6 解析、Task 7 两处生成）。
