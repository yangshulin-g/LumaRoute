<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import { useServerStore } from '../stores/server-store'
import { CONNECTION_STATUS_LEGEND, connectionStatusLabel } from '../stores/connection-status-label'
import type { ServerConnectionStatus } from '../stores/server-connection-status'
import LibrarySidebar from './LibrarySidebar.vue'
import ServerSwitcher from './ServerSwitcher.vue'
import { resolveLine } from '../presentation/line-presenters'

const appStore = useAppStore()
const serverStore = useServerStore()
const mediaStore = useMediaStore()
const route = useRoute()
const router = useRouter()

const topSearchTerm = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
const statusLegend = CONNECTION_STATUS_LEGEND

const activeProfile = computed(
  () => serverStore.profiles.find((profile) => profile.id === appStore.activeServerId) ?? null,
)

const searchInput = ref<HTMLInputElement | null>(null)
const activeLine = computed(() => resolveLine(activeProfile.value, mediaStore.activeLineId))
const activeStatus = computed<ServerConnectionStatus>(() =>
  activeProfile.value ? mediaStore.connectionStatus(activeProfile.value.id) : 'unknown',
)

const statusById = computed(() => {
  const map: Record<string, ServerConnectionStatus> = {}
  for (const profile of serverStore.profiles) {
    map[profile.id] = mediaStore.connectionStatus(profile.id)
  }
  return map
})

const needsReauthById = computed(() => {
  const map: Record<string, boolean> = {}
  for (const profile of serverStore.profiles) {
    map[profile.id] = mediaStore.connectionNeedsReauth(profile.id)
  }
  return map
})

watch(
  () => appStore.activeServerId,
  (serverId) => {
    if (!serverId) return
    void mediaStore.loadHome(serverId)
  },
  { immediate: true },
)

watch(
  () => serverStore.profiles.length,
  (count) => {
    if (count === 0) void router.replace({ name: 'onboarding' })
  },
)

function onSearchShortcut(event: KeyboardEvent): void {
  if (event.isComposing || !(event.metaKey || event.ctrlKey)) return
  const isK = event.code ? event.code === 'KeyK' : event.key.toLowerCase() === 'k'
  if (!isK) return
  event.preventDefault()
  searchInput.value?.focus()
}

onMounted(() => window.addEventListener('keydown', onSearchShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', onSearchShortcut))

function onTopSearch(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  void router.push({ name: 'search', query: value ? { q: value } : {} })
}

async function onSelectServer(profileId: string): Promise<void> {
  await appStore.selectServer(profileId)
  if (route.name !== 'home') {
    await router.push({ name: 'home' })
  }
}

async function onRetry(profileId: string): Promise<void> {
  if (appStore.activeServerId !== profileId) {
    await onSelectServer(profileId)
    return
  }
  await mediaStore.loadHome(profileId)
}

function onAddServer(): void {
  void router.push({ name: 'onboarding', query: { mode: 'add' } })
}

async function onReauth(profileId: string): Promise<void> {
  if (appStore.activeServerId !== profileId) await appStore.selectServer(profileId)
  await router.push({ name: 'settings', query: { reauth: '1' } })
}
</script>

<template>
  <div class="app-shell">
    <aside>
      <div class="aside-top">
        <RouterLink
          class="brand"
          to="/"
        >
          <span class="brand-mark">光路</span>
          <span class="brand-sub">LumaRoute</span>
        </RouterLink>
        <ServerSwitcher
          :profiles="serverStore.profiles"
          :active-id="appStore.activeServerId"
          :status-by-id="statusById"
          :needs-reauth-by-id="needsReauthById"
          @select="onSelectServer"
          @retry="onRetry"
          @add="onAddServer"
          @reauth="onReauth"
        />
        <p
          class="status-legend"
          data-testid="connection-status-legend"
          :title="statusLegend"
        >
          {{ statusLegend }}
        </p>
      </div>

      <div class="aside-mid">
        <LibrarySidebar :server-id="appStore.activeServerId" />
      </div>

      <div class="aside-bottom">
        <RouterLink
          class="settings-link"
          to="/settings"
        >
          服务器设置
        </RouterLink>
      </div>
    </aside>
    <div class="content">
      <header class="top-bar">
        <div
          v-if="activeProfile"
          class="top-meta"
        >
          <span class="server-name">{{ activeProfile.name }}</span>
          <div
            class="line-status-pill"
            data-testid="line-status-pill"
            :data-status="activeStatus"
            :title="connectionStatusLabel(activeStatus)"
          >
            <span
              class="status-dot"
              aria-hidden="true"
            />
            <span class="sr-only">{{ connectionStatusLabel(activeStatus) }}</span>
            <span class="line-label">{{ activeLine?.label ?? '尚无活动线路' }}</span>
          </div>
        </div>
        <label class="top-search">
          <span class="sr-only">搜索当前服务器</span>
          <input
            ref="searchInput"
            data-testid="current-server-search"
            type="search"
            role="searchbox"
            name="top-search"
            :value="topSearchTerm"
            placeholder="搜索当前服务器"
            autocomplete="off"
            aria-keyshortcuts="Control+K Meta+K"
            @input="onTopSearch"
          >
        </label>
      </header>
      <main>
        <RouterView v-if="serverStore.profiles.length > 0" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 15.5rem 1fr;
  min-height: 100vh;
  background:
    radial-gradient(60rem 30rem at 85% -10%, rgb(6 182 212 / 8%), transparent 70%),
    radial-gradient(40rem 24rem at -10% 110%, rgb(139 92 246 / 7%), transparent 70%),
    var(--lr-bg-base);
}

aside {
  position: sticky;
  top: 0;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 0;
  height: 100vh;
  overflow-y: auto;
  padding: 0.85rem 0.65rem;
  background: var(--lr-surface-card-solid);
  border-right: 1px solid var(--lr-border-subtle);
  box-shadow: inset -1px 0 0 rgb(255 255 255 / 3%);
}

.aside-top,
.aside-mid,
.aside-bottom {
  display: grid;
  gap: 0.85rem;
  min-width: 0;
}

.aside-mid {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--lr-border-subtle);
  align-content: start;
}

.aside-bottom {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--lr-border-subtle);
}

.brand {
  display: grid;
  gap: 0.05rem;
  padding: 0.4rem 0.7rem 0.55rem;
  text-decoration: none;
  color: var(--lr-text-primary);
  border-radius: var(--lr-radius-sm);
  transition: background var(--lr-ease);
}

.brand:hover {
  background: var(--lr-surface-hover);
}

.brand:focus-visible {
  outline: none;
  box-shadow: var(--lr-focus-ring);
}

.brand-mark {
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.2;
  background: linear-gradient(90deg, var(--lr-accent-cyan), var(--lr-accent-blue));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.brand-sub {
  font-size: var(--lr-font-xs);
  color: var(--lr-text-muted);
  letter-spacing: 0.02em;
}

.status-legend {
  margin: 0;
  padding: 0 0.7rem;
  font-size: 0.6875rem;
  line-height: 1.35;
  color: var(--lr-text-tertiary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.content {
  display: grid;
  grid-template-rows: auto 1fr;
  min-width: 0;
}

.top-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.25rem;
  padding: 0.7rem 1.35rem;
  background: var(--lr-surface-card-solid);
  border-bottom: 1px solid var(--lr-border-subtle);
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  aside,
  .top-bar {
    background: var(--lr-surface-card);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
}

.top-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.server-name {
  font-weight: 650;
  font-size: var(--lr-font-base);
  letter-spacing: -0.01em;
  color: var(--lr-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  max-width: 16rem;
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--lr-border-subtle);
  border-radius: 999px;
  background: var(--lr-surface-active);
  color: var(--lr-text-secondary);
  font-size: var(--lr-font-xs);
  font-weight: 550;
  transition:
    border-color var(--lr-ease),
    color var(--lr-ease);
}

.line-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  flex: 0 0 auto;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--lr-text-muted);
}

.line-status-pill[data-status='healthy'] {
  border-color: rgb(16 185 129 / 35%);
  color: var(--lr-text-primary);
}

.line-status-pill[data-status='healthy'] .status-dot {
  background: var(--lr-accent-emerald);
  box-shadow: 0 0 6px rgb(16 185 129 / 60%);
}

.line-status-pill[data-status='checking'] {
  border-color: rgb(245 158 11 / 35%);
}

.line-status-pill[data-status='checking'] .status-dot {
  background: var(--lr-accent-amber);
}

.line-status-pill[data-status='unhealthy'] {
  border-color: rgb(244 63 94 / 40%);
}

.line-status-pill[data-status='unhealthy'] .status-dot {
  background: var(--lr-accent-rose);
}

.top-search {
  flex: 1 1 16rem;
  max-width: 26rem;
  margin-left: auto;
}

.top-search input {
  width: 100%;
  min-height: 2.25rem;
  border-radius: 999px;
  padding-inline: 1rem;
  background: var(--lr-bg-canvas);
  border: 1px solid var(--lr-border-subtle);
  color: var(--lr-text-primary);
  transition:
    border-color var(--lr-ease),
    box-shadow var(--lr-ease);
}

.top-search input::placeholder {
  color: var(--lr-text-muted);
}

.top-search input:hover {
  border-color: var(--lr-border-hover);
}

.top-search input:focus-visible {
  outline: none;
  border-color: var(--lr-accent-cyan);
  box-shadow: var(--lr-focus-ring);
}

main {
  padding: 1.35rem 1.5rem 2.25rem;
  min-width: 0;
}

.settings-link {
  display: block;
  padding: 0.55rem 0.75rem;
  border-radius: var(--lr-radius-sm);
  text-decoration: none;
  color: var(--lr-text-secondary);
  font-size: var(--lr-font-md);
  font-weight: 500;
  transition:
    background var(--lr-ease),
    color var(--lr-ease);
}

.settings-link:hover,
.settings-link.router-link-active {
  background: var(--lr-surface-hover);
  color: var(--lr-text-primary);
}

.settings-link.router-link-active {
  font-weight: 600;
  background: var(--lr-accent-soft);
}

.settings-link:focus-visible {
  outline: none;
  box-shadow: var(--lr-focus-ring);
}
</style>
