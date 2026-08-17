<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import { useServerStore } from '../stores/server-store'
import { CONNECTION_STATUS_LEGEND } from '../stores/connection-status-label'
import type { ServerConnectionStatus } from '../stores/server-connection-status'
import LibrarySidebar from './LibrarySidebar.vue'
import ServerSwitcher from './ServerSwitcher.vue'

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

const activeLineLabel = computed(() => {
  const profile = activeProfile.value
  if (!profile) return null
  const lineId = mediaStore.activeLineId ?? profile.preferredLineId
  return profile.lines.find((line) => line.id === lineId)?.label ?? null
})

const statusById = computed(() => {
  const map: Record<string, ServerConnectionStatus> = {}
  for (const profile of serverStore.profiles) {
    map[profile.id] = mediaStore.connectionStatus(profile.id)
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
          @select="onSelectServer"
          @retry="onRetry"
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
          <span
            v-if="activeLineLabel"
            class="line-hint"
          >
            当前线路：{{ activeLineLabel }}
          </span>
        </div>
        <label class="top-search">
          <span class="sr-only">搜索当前服务器</span>
          <input
            type="search"
            role="searchbox"
            name="top-search"
            :value="topSearchTerm"
            placeholder="搜索当前服务器"
            autocomplete="off"
            @input="onTopSearch"
          >
        </label>
      </header>
      <main>
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 15.5rem 1fr;
  min-height: 100vh;
  background: var(--lr-canvas);
}

aside {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 0;
  min-height: 100vh;
  padding: 0.85rem 0.65rem 0.85rem;
  background: var(--lr-surface);
  border-right: 1px solid var(--lr-border);
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
  border-top: 1px solid var(--lr-border);
  align-content: start;
}

.aside-bottom {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--lr-border);
}

.brand {
  display: grid;
  gap: 0.05rem;
  padding: 0.4rem 0.7rem 0.55rem;
  text-decoration: none;
  color: inherit;
  border-radius: var(--lr-radius-sm);
}

.brand:hover {
  background: var(--lr-surface-hover);
}

.brand-mark {
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.2;
}

.brand-sub {
  font-size: var(--lr-font-xs);
  color: var(--lr-text-tertiary);
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.25rem;
  padding: 0.7rem 1.35rem;
  background: color-mix(in srgb, var(--lr-surface) 92%, transparent);
  border-bottom: 1px solid var(--lr-border);
  backdrop-filter: blur(10px);
}

.top-meta {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.server-name {
  font-weight: 650;
  font-size: var(--lr-font-base);
  letter-spacing: -0.01em;
}

.line-hint {
  font-size: var(--lr-font-sm);
  color: var(--lr-text-secondary);
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
  background: var(--lr-surface-muted);
  color: var(--lr-text);
}

.settings-link.router-link-active {
  font-weight: 600;
}
</style>
