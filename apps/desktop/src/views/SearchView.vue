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

<style scoped>
.search-view {
  display: grid;
  gap: 1.25rem;
  width: 100%;
  min-width: 0;
}

.view-header {
  display: grid;
  gap: 0.7rem;
  max-width: 36rem;
}

h1 {
  margin: 0;
  color: var(--lr-text-primary);
  letter-spacing: -0.01em;
}

.result-title {
  margin: 0;
  font-size: var(--lr-font-md);
  font-weight: 600;
  color: var(--lr-text-secondary);
  font-variant-numeric: tabular-nums;
}

.empty-state {
  margin: 0;
  padding: 2.5rem 0.25rem;
  text-align: center;
  border: 1px dashed var(--lr-border-strong);
  border-radius: var(--lr-radius-md);
  background: var(--lr-surface-card-solid);
}
</style>
