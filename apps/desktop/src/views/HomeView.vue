<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ContinueWatchingCard from '../components/ContinueWatchingCard.vue'
import { resolveLine } from '../presentation/line-presenters'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import { useServerStore } from '../stores/server-store'
import type { ServerConnectionStatus } from '../stores/server-connection-status'

const props = defineProps<{
  activeServerId?: string
}>()

const appStore = useAppStore()
const mediaStore = useMediaStore()
const serverStore = useServerStore()

/** Prefer live app-store id; route props can stay stale after bootstrap/server switch. */
const activeServerId = computed(
  () => appStore.activeServerId ?? (props.activeServerId !== 'missing' ? props.activeServerId : null),
)

const activeProfile = computed(
  () => serverStore.profiles.find((profile) => profile.id === activeServerId.value) ?? null,
)

const status = computed<ServerConnectionStatus>(() =>
  activeServerId.value ? mediaStore.connectionStatus(activeServerId.value) : 'unknown',
)
const errorMessage = computed(() =>
  activeServerId.value ? mediaStore.connectionError(activeServerId.value) : null,
)

const activeLineLabel = computed(
  () => resolveLine(activeProfile.value, mediaStore.activeLineId)?.label ?? null,
)

const connectionLabels: Record<ServerConnectionStatus, string> = {
  healthy: '连接正常',
  checking: '正在检查',
  unhealthy: '连接异常',
  unknown: '尚未检查',
}
const connectionLabel = computed(() => connectionLabels[status.value])
</script>

<template>
  <section class="home-view">
    <header class="home-header">
      <h1>首页</h1>
    </header>

    <div class="home-bento">
      <section
        class="lr-glass-card line-card"
        aria-labelledby="line-heading"
      >
        <h2 id="line-heading">
          当前连接
        </h2>
        <p
          class="line-label"
          data-testid="active-line"
        >
          {{ activeLineLabel ?? '尚无活动线路' }}
        </p>
        <p
          class="lr-muted"
          :data-status="status"
        >
          连接状态：{{ connectionLabel }}
        </p>
      </section>

      <p
        v-if="status === 'checking' || status === 'unknown'"
        class="lr-muted home-status"
        data-testid="home-loading"
      >
        正在加载服务器内容…
      </p>
      <p
        v-else-if="status === 'unhealthy'"
        class="home-error home-status"
        data-testid="home-error"
      >
        {{ errorMessage ?? '加载失败，请使用侧栏重试。' }}
      </p>

      <template v-else>
        <section
          class="lr-glass-card continue-panel"
          aria-labelledby="continue-watching-heading"
        >
          <h2 id="continue-watching-heading">
            继续观看
          </h2>
          <div
            v-if="mediaStore.continueWatching.length && activeServerId"
            class="shelf"
          >
            <ContinueWatchingCard
              v-for="entry in mediaStore.continueWatching"
              :key="entry.id"
              class="shelf-item"
              :item="entry"
              :profile-id="activeServerId"
            />
          </div>
          <p
            v-else
            class="lr-muted"
            data-testid="home-continue-empty"
          >
            暂无继续观看的内容。
          </p>
        </section>

        <section
          class="library-bento"
          aria-labelledby="libraries-heading"
        >
          <h2 id="libraries-heading">
            媒体库
          </h2>
          <p
            v-if="mediaStore.libraries.length === 0"
            class="lr-muted"
            data-testid="home-libraries-empty"
          >
            该服务器暂无媒体库。
          </p>
          <div
            v-else
            class="library-grid"
          >
            <RouterLink
              v-for="library in mediaStore.libraries"
              :key="library.id"
              :data-testid="`library-bento-${library.id}`"
              :to="`/library/${library.id}`"
              class="lr-glass-card library-entry"
            >
              <span class="library-name">{{ library.name }}</span>
              <span class="lr-muted library-type">{{ library.collectionType ?? '媒体库' }}</span>
            </RouterLink>
          </div>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.home-view {
  display: grid;
  gap: 1.25rem;
}

.home-header {
  display: grid;
  gap: 0.25rem;
}

.home-bento {
  display: grid;
  grid-template-columns: minmax(14rem, 1fr) minmax(0, 3fr);
  gap: 1rem;
  align-items: start;
}

.home-bento > * {
  min-width: 0;
}

.home-status,
.continue-panel,
.library-bento {
  grid-column: 2;
}

.line-card {
  grid-row: 1 / span 2;
}

@media (max-width: 60rem) {
  .home-bento {
    grid-template-columns: minmax(0, 1fr);
  }

  .home-status,
  .continue-panel,
  .library-bento,
  .line-card {
    grid-column: 1;
    grid-row: auto;
  }
}

.line-card,
.continue-panel {
  display: grid;
  gap: 0.5rem;
  padding: 1rem 1.15rem;
}

.line-card p {
  margin: 0;
}

.line-label {
  font-weight: 650;
  color: var(--lr-text-primary);
  overflow-wrap: anywhere;
}

.home-status {
  margin: 0;
}

.home-error {
  max-width: 36rem;
  padding: 0.85rem 1rem;
  border-radius: var(--lr-radius-sm);
  border: 1px solid color-mix(in srgb, var(--lr-danger) 28%, var(--lr-border));
  background: var(--lr-danger-soft);
  color: var(--lr-danger);
  line-height: 1.45;
}

section h2 {
  margin: 0;
}

.shelf {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding: 0.15rem 0.15rem 0.55rem;
  scroll-snap-type: x proximity;
}

.shelf-item {
  flex: 0 0 9rem;
  width: 9rem;
  scroll-snap-align: start;
}

.library-bento {
  display: grid;
  gap: 0.75rem;
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.75rem;
}

.library-entry {
  display: grid;
  gap: 0.25rem;
  padding: 0.95rem 1.05rem;
  text-decoration: none;
  color: var(--lr-text-primary);
  transition:
    border-color var(--lr-ease),
    transform var(--lr-ease);
}

.library-entry:hover {
  border-color: var(--lr-border-hover);
  transform: translateY(-1px);
}

.library-entry:focus-visible {
  outline: none;
  box-shadow: var(--lr-focus-ring);
}

.library-name {
  font-weight: 650;
}

.library-type {
  font-size: var(--lr-font-sm);
}
</style>
