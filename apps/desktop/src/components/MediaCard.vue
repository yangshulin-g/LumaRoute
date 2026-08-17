<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef } from 'vue'
import { RouterLink } from 'vue-router'
import type { MediaItem } from '@lumaroute/core'
import { useSecureImage } from '../queries/use-secure-image'

const props = defineProps<{
  item: MediaItem
  profileId: string
}>()

const root = ref<HTMLElement | null>(null)
const nearViewport = ref(false)
let observer: globalThis.IntersectionObserver | null = null

const profileId = toRef(props, 'profileId')
const itemRef = computed(() => props.item)
const imageSource = useSecureImage(profileId, itemRef, nearViewport)

const metaLine = computed(() => {
  const year = props.item.productionYear
  return year != null ? String(year) : null
})

onMounted(() => {
  if (typeof globalThis.IntersectionObserver === 'undefined') {
    nearViewport.value = true
    return
  }
  observer = new globalThis.IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        nearViewport.value = true
        observer?.disconnect()
        observer = null
      }
    },
    { rootMargin: '200px 0px' },
  )
  if (root.value) observer.observe(root.value)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div
    ref="root"
    class="media-card-host"
  >
    <RouterLink
      class="media-card"
      data-testid="media-card"
      :data-item-id="item.id"
      :data-kind="item.kind"
      :to="`/media/${item.id}`"
    >
      <div class="poster-wrap">
        <img
          v-if="imageSource"
          class="poster"
          :src="imageSource"
          :alt="item.name"
        >
        <div
          v-else
          class="poster poster-placeholder"
          aria-hidden="true"
        />
      </div>
      <span class="title">{{ item.name }}</span>
      <span
        v-if="metaLine"
        class="meta"
      >{{ metaLine }}</span>
    </RouterLink>
  </div>
</template>

<style scoped>
.media-card-host {
  width: 100%;
  min-width: 0;
}

.media-card {
  display: grid;
  gap: 0.4rem;
  color: inherit;
  text-decoration: none;
  outline: none;
}

.media-card:focus-visible .poster-wrap {
  box-shadow: var(--lr-focus-ring);
}

.poster-wrap {
  border-radius: var(--lr-radius-md);
  overflow: hidden;
  background: var(--lr-surface-muted);
  box-shadow: var(--lr-shadow);
  transition:
    transform var(--lr-ease),
    box-shadow var(--lr-ease);
}

.media-card:hover .poster-wrap,
.media-card:focus-visible .poster-wrap {
  transform: translateY(-2px);
  box-shadow: var(--lr-shadow-poster);
}

.poster {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  background: linear-gradient(160deg, #dfe7f1 0%, #c9d5e4 100%);
}

.poster-placeholder {
  min-height: 0;
}

.title {
  font-size: var(--lr-font-sm);
  font-weight: 550;
  line-height: 1.3;
  color: var(--lr-text);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
}

.meta {
  font-size: var(--lr-font-xs);
  color: var(--lr-text-tertiary);
  line-height: 1.2;
}
</style>
