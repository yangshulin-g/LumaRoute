<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef } from 'vue'
import { RouterLink } from 'vue-router'
import type { MediaItem } from '@lumaroute/core'
import { mediaKindLabel } from '../presentation/media-presenters'
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

const kindLabel = computed(() => mediaKindLabel(props.item.kind))

const metaLine = computed(() =>
  [props.item.productionYear, kindLabel.value]
    .filter((value) => value != null)
    .join(' · '),
)

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
        <span
          class="kind-chip"
          aria-hidden="true"
        >{{ kindLabel }}</span>
      </div>
      <span
        class="title"
        :title="item.name"
      >{{ item.name }}</span>
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

.poster-wrap {
  position: relative;
  border-radius: var(--lr-radius-md);
  overflow: hidden;
  background: var(--lr-surface-card-solid);
  border: 1px solid var(--lr-border-subtle);
  box-shadow: var(--lr-shadow);
  transition:
    transform var(--lr-ease),
    border-color var(--lr-ease),
    box-shadow var(--lr-ease);
}

.media-card:hover .poster-wrap {
  transform: translateY(-4px);
  border-color: var(--lr-border-hover);
  box-shadow: var(--lr-shadow-poster);
}

.media-card:focus-visible .poster-wrap {
  transform: translateY(-4px);
  border-color: var(--lr-border-hover);
  box-shadow: var(--lr-focus-ring), var(--lr-shadow-poster);
}

.poster {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  background: linear-gradient(160deg, var(--lr-surface-muted) 0%, var(--lr-bg-canvas) 100%);
}

.kind-chip {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--lr-border-strong);
  background: var(--lr-surface-card-solid);
  color: var(--lr-text-primary);
  font-size: var(--lr-font-xs);
  font-weight: 600;
  line-height: 1.4;
  pointer-events: none;
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .kind-chip {
    background: var(--lr-surface-card);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
}

.media-card:hover .title {
  color: var(--lr-accent-cyan);
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
  transition: color var(--lr-ease);
}

.meta {
  font-size: var(--lr-font-xs);
  color: var(--lr-text-tertiary);
  line-height: 1.2;
}
</style>
