<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import MediaCard from '../components/MediaCard.vue'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'

const props = defineProps<{
  activeServerId?: string
}>()

const appStore = useAppStore()
const mediaStore = useMediaStore()

/** Prefer live app-store id; route props can stay stale after bootstrap/server switch. */
const activeServerId = computed(
  () => appStore.activeServerId ?? (props.activeServerId !== 'missing' ? props.activeServerId : null),
)

const status = computed(() =>
  activeServerId.value ? mediaStore.connectionStatus(activeServerId.value) : 'unknown',
)
const errorMessage = computed(() =>
  activeServerId.value ? mediaStore.connectionError(activeServerId.value) : null,
)
</script>

<template>
  <section class="home-view">
    <header class="home-header">
      <h1>首页</h1>
      <p
        class="lr-muted"
        data-testid="active-line"
      >
        当前线路：{{ mediaStore.activeLineId ?? '—' }}
      </p>
    </header>

    <p
      v-if="status === 'checking' || status === 'unknown'"
      class="lr-muted"
      data-testid="home-loading"
    >
      正在加载服务器内容…
    </p>
    <p
      v-else-if="status === 'unhealthy'"
      class="home-error"
      data-testid="home-error"
    >
      {{ errorMessage ?? '加载失败，请使用侧栏重试。' }}
    </p>

    <template v-else>
      <section aria-labelledby="continue-watching-heading">
        <h2 id="continue-watching-heading">
          继续观看
        </h2>
        <p
          v-if="mediaStore.continueWatching.length === 0"
          class="lr-muted"
          data-testid="home-continue-empty"
        >
          暂无继续观看的内容。
        </p>
        <div
          v-else
          class="shelf"
        >
          <div
            v-for="item in mediaStore.continueWatching"
            :key="item.id"
            class="shelf-item"
          >
            <MediaCard
              v-if="activeServerId"
              :item="item"
              :profile-id="activeServerId"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="libraries-heading">
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
        <ul
          v-else
          class="library-list"
        >
          <li
            v-for="library in mediaStore.libraries"
            :key="library.id"
          >
            <RouterLink
              class="library-entry"
              :to="`/library/${library.id}`"
            >
              <span class="library-name">{{ library.name }}</span>
              <span class="library-chevron lr-muted">打开</span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.home-view {
  display: grid;
  gap: 1.85rem;
}

.home-header {
  display: grid;
  gap: 0.25rem;
}

.home-error {
  margin: 0;
  max-width: 36rem;
  padding: 0.85rem 1rem;
  border-radius: var(--lr-radius-sm);
  border: 1px solid color-mix(in srgb, var(--lr-danger) 28%, var(--lr-border));
  background: var(--lr-danger-soft);
  color: var(--lr-danger);
  line-height: 1.45;
}

section > h2 {
  margin-bottom: 0.15rem;
}

.shelf {
  display: flex;
  gap: 1rem;
  margin-top: 0.85rem;
  overflow-x: auto;
  padding: 0.15rem 0.15rem 0.55rem;
  scroll-snap-type: x proximity;
}

.shelf-item {
  flex: 0 0 9rem;
  width: 9rem;
  scroll-snap-align: start;
}

.library-list {
  margin: 0.85rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.5rem;
  max-width: 36rem;
}

.library-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1.05rem;
  border: 1px solid var(--lr-border);
  border-radius: var(--lr-radius-md);
  background: var(--lr-surface);
  text-decoration: none;
  box-shadow: var(--lr-shadow);
  transition:
    border-color var(--lr-ease),
    background var(--lr-ease),
    box-shadow var(--lr-ease),
    transform var(--lr-ease);
}

.library-entry:hover {
  border-color: color-mix(in srgb, var(--lr-accent) 35%, var(--lr-border));
  background: color-mix(in srgb, var(--lr-accent) 4%, var(--lr-surface));
  box-shadow: var(--lr-shadow-md);
  transform: translateY(-1px);
}

.library-name {
  font-weight: 650;
}

.library-chevron {
  font-size: var(--lr-font-sm);
}
</style>
