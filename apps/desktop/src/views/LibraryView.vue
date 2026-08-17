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
    <header>
      <h1>{{ libraryTitle }}</h1>
      <p
        class="lr-muted"
        data-testid="active-line"
      >
        当前线路：{{ mediaStore.activeLineId ?? '—' }}
      </p>
    </header>

    <VirtualPosterGrid
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
  gap: 1rem;
}

header {
  display: grid;
  gap: 0.25rem;
}
</style>
