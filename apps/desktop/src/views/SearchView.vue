<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
const router = useRouter()
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

function onSearchInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  term.value = value
  void router.replace({ name: 'search', query: value ? { q: value } : {} })
  scheduleSearch(value)
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
    <header>
      <h1>搜索</h1>
      <label class="search-field">
        <span class="sr-only">搜索当前服务器</span>
        <input
          name="search"
          type="search"
          role="searchbox"
          :value="term"
          placeholder="搜索当前服务器"
          autocomplete="off"
          @input="onSearchInput"
        >
      </label>
      <p
        class="lr-muted"
        data-testid="active-line"
      >
        当前线路：{{ mediaStore.activeLineId ?? '—' }}
      </p>
      <p
        v-if="hasTerm && mediaStore.searchResults"
        class="result-title lr-muted"
      >
        搜索「{{ term.trim() }}」· {{ resultCount }} 条（当前服务器）
      </p>
    </header>

    <p
      v-if="!hasTerm"
      class="empty-state lr-muted"
      data-testid="search-empty"
    >
      输入关键词以搜索当前服务器
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
  gap: 1.1rem;
}

header {
  display: grid;
  gap: 0.7rem;
  max-width: 36rem;
}

.search-field input {
  min-height: 2.5rem;
  border-radius: 999px;
  padding-inline: 1rem;
  background: var(--lr-surface);
  border: 1px solid var(--lr-border);
  box-shadow: var(--lr-shadow);
}

.search-field input:hover:not(:disabled):not(:focus) {
  border-color: var(--lr-border-strong);
  background: var(--lr-surface);
}

.empty-state,
.result-title {
  margin: 0;
}

.empty-state {
  padding: 2.5rem 0.25rem;
  text-align: center;
  border: 1px dashed var(--lr-border);
  border-radius: var(--lr-radius-md);
  background: color-mix(in srgb, var(--lr-surface) 70%, transparent);
}
</style>
