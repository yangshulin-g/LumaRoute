<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useMediaStore } from '../stores/media-store'

const props = defineProps<{
  serverId: string | null
}>()

const mediaStore = useMediaStore()

const status = computed(() =>
  props.serverId ? mediaStore.connectionStatus(props.serverId) : 'unknown',
)
const errorMessage = computed(() =>
  props.serverId ? mediaStore.connectionError(props.serverId) : null,
)
</script>

<template>
  <nav
    class="library-sidebar"
    aria-label="媒体库"
  >
    <h2>媒体库</h2>
    <p
      v-if="!serverId"
      class="lr-muted"
      data-testid="library-sidebar-empty"
    >
      请选择服务器以浏览媒体库。
    </p>
    <p
      v-else-if="status === 'checking' || status === 'unknown'"
      class="lr-muted"
      data-testid="library-sidebar-loading"
    >
      正在加载媒体库…
    </p>
    <p
      v-else-if="status === 'unhealthy'"
      class="sidebar-error"
      data-testid="library-sidebar-error"
    >
      {{ errorMessage ?? '加载失败，请重试。' }}
    </p>
    <p
      v-else-if="mediaStore.libraries.length === 0"
      class="lr-muted"
      data-testid="library-sidebar-empty-libs"
    >
      该服务器暂无媒体库。
    </p>
    <ul
      v-else
      data-testid="library-sidebar-list"
    >
      <li
        v-for="library in mediaStore.libraries"
        :key="library.id"
      >
        <RouterLink
          class="nav-item"
          :data-library-id="library.id"
          :data-testid="
            library.collectionType === 'movies'
              ? 'library-movies'
              : `library-${library.collectionType ?? library.id}`
          "
          :to="`/library/${library.id}`"
        >
          {{ library.name }}
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.library-sidebar {
  display: grid;
  gap: 0.4rem;
}

h2 {
  margin: 0;
  padding: 0 0.7rem;
  font-size: 0.6875rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lr-text-tertiary);
}

p {
  margin: 0;
  padding: 0 0.7rem;
  font-size: var(--lr-font-sm);
}

.sidebar-error {
  color: var(--lr-danger);
  font-size: var(--lr-font-sm);
  line-height: 1.4;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.15rem;
}

.nav-item {
  display: block;
  padding: 0.45rem 0.7rem;
  border-radius: var(--lr-radius-sm);
  text-decoration: none;
  color: inherit;
  position: relative;
  font-size: var(--lr-font-md);
  font-weight: 500;
  transition: background var(--lr-ease);
}

.nav-item:hover {
  background: var(--lr-surface-hover);
}

.nav-item.router-link-active {
  background: var(--lr-accent-soft);
  font-weight: 650;
}

.nav-item.router-link-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.4rem;
  bottom: 0.4rem;
  width: 3px;
  border-radius: 999px;
  background: var(--lr-accent);
}
</style>
