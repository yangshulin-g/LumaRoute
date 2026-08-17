<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { MediaItem } from '@lumaroute/core'
import MediaCard from './MediaCard.vue'

const COLUMN_MIN = 140
const GAP = 16

const props = withDefaults(
  defineProps<{
    items: readonly MediaItem[]
    profileId: string
    estimateSize?: number
    overscan?: number
    hasNextPage?: boolean
    columnMinWidth?: number
  }>(),
  {
    estimateSize: 220,
    overscan: 3,
    hasNextPage: false,
    columnMinWidth: COLUMN_MIN,
  },
)

const emit = defineEmits<{
  visibleRange: [range: { startIndex: number; endIndex: number }]
  loadNext: []
}>()

const scrollElement = ref<HTMLDivElement | null>(null)
const containerWidth = ref(600)
let loadNextRequested = false

const columnCount = computed(() => {
  const width = Math.max(containerWidth.value, 1)
  const min = props.columnMinWidth
  return Math.max(1, Math.floor((width + GAP) / (min + GAP)))
})

const rowCount = computed(() => {
  if (props.items.length === 0) return 0
  return Math.ceil(props.items.length / columnCount.value)
})

const virtualizer = useVirtualizer({
  get count() {
    return rowCount.value
  },
  getScrollElement: () => scrollElement.value,
  estimateSize: () => props.estimateSize,
  get overscan() {
    return props.overscan
  },
  initialRect: { width: 600, height: 800 },
  observeElementRect: (_instance, cb) => {
    const notify = () => {
      const target = scrollElement.value
      const width = target?.clientWidth || 600
      const height = target?.clientHeight || 800
      containerWidth.value = width
      cb({ width, height })
    }
    notify()
    const el = scrollElement.value
    if (!el || typeof globalThis.ResizeObserver === 'undefined') {
      return () => undefined
    }
    const observer = new globalThis.ResizeObserver(notify)
    observer.observe(el)
    return () => observer.disconnect()
  },
})

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

function itemsForRow(rowIndex: number): MediaItem[] {
  const start = rowIndex * columnCount.value
  return props.items.slice(start, start + columnCount.value) as MediaItem[]
}

watch(
  virtualItems,
  (rows) => {
    if (rows.length === 0) return
    const cols = columnCount.value
    const startIndex = rows[0]!.index * cols
    const endIndex = Math.min(
      props.items.length - 1,
      rows[rows.length - 1]!.index * cols + cols - 1,
    )
    emit('visibleRange', { startIndex, endIndex })
  },
  { immediate: true },
)

watch(
  () => props.items.length,
  () => {
    loadNextRequested = false
    virtualizer.value.measure()
  },
)

watch(columnCount, () => {
  virtualizer.value.measure()
})

watch(
  () => props.hasNextPage,
  (value) => {
    if (value) loadNextRequested = false
  },
)

function maybeLoadNext(): void {
  const el = scrollElement.value
  if (!el || !props.hasNextPage || loadNextRequested) return
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
  if (remaining <= props.estimateSize * 2) {
    loadNextRequested = true
    emit('loadNext')
  }
}

function onScroll(): void {
  maybeLoadNext()
}

function measure() {
  virtualizer.value.measure()
}

onMounted(() => {
  measure()
  globalThis.addEventListener('resize', measure)
})

onUnmounted(() => {
  globalThis.removeEventListener('resize', measure)
})
</script>

<template>
  <div
    ref="scrollElement"
    class="poster-scroll"
    data-testid="poster-grid"
    @scroll="onScroll"
  >
    <div
      class="poster-inner"
      :style="{ height: `${totalSize}px` }"
    >
      <div
        v-for="row in virtualItems"
        :key="row.index"
        class="poster-row"
        :data-row-index="row.index"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: `${row.size}px`,
          transform: `translateY(${row.start}px)`,
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        }"
      >
        <MediaCard
          v-for="item in itemsForRow(row.index)"
          :key="item.id"
          :item="item"
          :profile-id="profileId"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.poster-scroll {
  height: min(72vh, 760px);
  overflow: auto;
  position: relative;
  margin: 0 -0.15rem;
  padding: 0.15rem;
}

.poster-inner {
  position: relative;
  width: 100%;
}

.poster-row {
  display: grid;
  gap: 1.1rem;
  align-content: start;
  padding-bottom: 0.35rem;
  box-sizing: border-box;
}
</style>
