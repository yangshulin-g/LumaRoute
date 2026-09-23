<script setup lang="ts">
import { computed } from 'vue'
import type { ItemQuery, MediaKind } from '@lumaroute/core'
import VirtualPosterGrid from '../components/VirtualPosterGrid.vue'
import { useLibraryItems } from '../queries/use-library-items'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'

const props = defineProps<{
  serverId?: string
  libraryId?: string
  parentId?: string
  kinds?: readonly MediaKind[]
}>()

const appStore = useAppStore()
const mediaStore = useMediaStore()
const serverId = computed(
  () => appStore.activeServerId ?? (props.serverId !== 'missing' ? props.serverId ?? '' : ''),
)

const query = computed<ItemQuery>(() => {
  if (props.parentId) {
    const result: ItemQuery = {
      parentId: props.parentId,
      startIndex: 0,
      limit: 60,
      kinds: props.kinds ?? ['season'],
    }
    return result
  }
  const result: ItemQuery = {
    startIndex: 0,
    limit: 60,
    kinds: props.kinds ?? ['movie', 'series'],
  }
  if (props.libraryId) result.libraryId = props.libraryId
  return result
})

const libraryQuery = useLibraryItems(serverId, query)

const items = computed(() => libraryQuery.data.value?.pages.flatMap((page) => page.items) ?? [])
const hasNextPage = computed(() => Boolean(libraryQuery.hasNextPage.value))
const totalCount = computed(() => libraryQuery.data.value?.pages.at(-1)?.total ?? null)

const libraryTitle = computed(() => {
  if (!props.libraryId) return '媒体库'
  return mediaStore.libraries.find((library) => library.id === props.libraryId)?.name ?? '媒体库'
})

async function loadNext(): Promise<void> {
  if (!libraryQuery.hasNextPage.value || libraryQuery.isFetchingNextPage.value) return
  await libraryQuery.fetchNextPage()
}
</script>

<template>
  <section class="library-view">
    <header class="view-header">
      <div class="heading-row">
        <h1>{{ libraryTitle }}</h1>
        <span
          v-if="totalCount != null"
          class="count-chip"
          data-testid="library-count"
        >共 {{ totalCount }} 项</span>
      </div>
      <p
        class="lr-muted line-note"
        data-testid="active-line"
      >
        当前线路：{{ mediaStore.activeLineId ?? '—' }}
      </p>
    </header>

    <p
      v-if="totalCount === 0"
      class="empty-state lr-muted"
      data-testid="library-empty"
    >
      此媒体库暂无内容
    </p>

    <VirtualPosterGrid
      v-else
      :items="items"
      :profile-id="serverId"
      :estimate-size="240"
      :has-next-page="hasNextPage"
      @load-next="loadNext"
    />
  </section>
</template>

<style scoped>
.library-view {
  display: grid;
  gap: 1.25rem;
  width: 100%;
  min-width: 0;
}

.view-header {
  display: grid;
  gap: 0.35rem;
}

.heading-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.75rem;
}

h1 {
  margin: 0;
  color: var(--lr-text-primary);
  letter-spacing: -0.01em;
}

.count-chip {
  padding: 0.125rem 0.625rem;
  border-radius: 999px;
  border: 1px solid var(--lr-border-subtle);
  background: var(--lr-accent-soft);
  color: var(--lr-accent-cyan);
  font-size: var(--lr-font-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.line-note {
  margin: 0;
  font-size: var(--lr-font-sm);
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
