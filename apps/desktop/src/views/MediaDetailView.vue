<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { AppError, type MediaItem, type MediaKind } from '@lumaroute/core'
import PlayerControls from '../components/PlayerControls.vue'
import { injectServices } from '../composition/inject-services'
import { useSecureImage } from '../queries/use-secure-image'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import { usePlayerStore } from '../stores/player-store'
import { connectionErrorMessage, isAbortError } from '../stores/server-connection-status'

const props = defineProps<{
  serverId?: string
  itemId: string
}>()

const services = injectServices()
const appStore = useAppStore()
const mediaStore = useMediaStore()
const playerStore = usePlayerStore()
const selectedSeasonId = ref<string | null>(null)
const episodes = ref<readonly MediaItem[]>([])
const posterEnabled = ref(true)
const detailStatus = ref<'loading' | 'ready' | 'error'>('loading')
const detailError = ref<string | null>(null)
let detailController: AbortController | null = null

const resolvedServerId = computed(
  () => appStore.activeServerId ?? (props.serverId !== 'missing' ? props.serverId : null),
)

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function formatRuntime(totalSeconds: number | null): string | null {
  if (totalSeconds == null) return null
  return formatClock(totalSeconds)
}

function kindLabel(kind: MediaKind): string {
  switch (kind) {
    case 'movie':
      return '电影'
    case 'series':
      return '剧集'
    case 'season':
      return '季'
    case 'episode':
      return '单集'
  }
}

const item = computed(() => mediaStore.detailItem)
const seasons = computed(() =>
  mediaStore.detailChildren.filter((entry) => entry.kind === 'season'),
)
const canResume = computed(() => (item.value?.playbackPositionSeconds ?? 0) > 0)
const mediaSummary = computed(() => {
  const current = item.value
  if (!current) return null
  const parts: string[] = [kindLabel(current.kind)]
  const runtime = formatRuntime(current.runtimeSeconds)
  if (runtime) parts.push(runtime)
  return parts.join(' · ')
})

const profileId = computed(() => resolvedServerId.value ?? 'missing')
const itemRef = computed(
  () =>
    item.value ?? {
      id: props.itemId,
      kind: 'movie' as const,
      name: '',
      overview: null,
      productionYear: null,
      runtimeSeconds: null,
      parentId: null,
      seriesId: null,
      indexNumber: null,
      imageTag: null,
      playbackPositionSeconds: 0,
    },
)
const posterSource = useSecureImage(profileId, itemRef, posterEnabled)

async function loadItem(serverId: string, itemId: string, signal: AbortSignal): Promise<MediaItem> {
  const result = await services.media.getItems(
    serverId,
    {
      ids: [itemId],
      startIndex: 0,
      limit: 1,
    },
    signal,
  )
  const next = result.value.items[0]
  if (!next) throw new AppError('NetworkUnavailable', 'Media item was not found')
  mediaStore.detailItem = next
  mediaStore.detailChildren = []
  mediaStore.activeLineId = result.lineId
  return next
}

async function loadChildren(
  serverId: string,
  parentId: string,
  kind: 'season' | 'episode',
  signal: AbortSignal,
): Promise<readonly MediaItem[]> {
  const result = await services.media.getItems(
    serverId,
    {
      parentId,
      kinds: [kind],
      startIndex: 0,
      limit: 200,
    },
    signal,
  )
  mediaStore.activeLineId = result.lineId
  return result.value.items
}

async function loadDetail(): Promise<void> {
  detailController?.abort()
  detailController = new AbortController()
  const signal = detailController.signal
  selectedSeasonId.value = null
  episodes.value = []
  mediaStore.detailItem = null
  mediaStore.detailChildren = []
  detailError.value = null

  const serverId = resolvedServerId.value
  if (!serverId) {
    detailStatus.value = 'error'
    detailError.value = '请先选择服务器。'
    return
  }

  detailStatus.value = 'loading'
  try {
    const next = await loadItem(serverId, props.itemId, signal)
    if (signal.aborted) return
    if (next.kind === 'series') {
      mediaStore.detailChildren = await loadChildren(serverId, next.id, 'season', signal)
    }
    if (signal.aborted) return
    detailStatus.value = 'ready'
  } catch (error) {
    if (signal.aborted || isAbortError(error)) return
    detailStatus.value = 'error'
    detailError.value = connectionErrorMessage(error)
  }
}

async function selectSeason(seasonId: string): Promise<void> {
  const serverId = resolvedServerId.value
  if (!serverId) return
  selectedSeasonId.value = seasonId
  detailController?.abort()
  detailController = new AbortController()
  try {
    episodes.value = await loadChildren(serverId, seasonId, 'episode', detailController.signal)
  } catch (error) {
    if (isAbortError(error)) return
    detailStatus.value = 'error'
    detailError.value = connectionErrorMessage(error)
  }
}

async function playFromStart(): Promise<void> {
  const serverId = resolvedServerId.value
  if (!serverId) return
  try {
    await playerStore.play(serverId, props.itemId, 0)
  } catch {
    // player-store already records lastError for PlayerControls
  }
}

async function resumePlayback(): Promise<void> {
  const serverId = resolvedServerId.value
  if (!serverId) return
  const position = item.value?.playbackPositionSeconds ?? 0
  try {
    await playerStore.play(serverId, props.itemId, position)
  } catch {
    // player-store already records lastError for PlayerControls
  }
}

watch(
  () => [resolvedServerId.value, props.itemId] as const,
  () => {
    void loadDetail()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  detailController?.abort()
  detailController = null
})
</script>

<template>
  <p
    v-if="detailStatus === 'loading'"
    class="lr-muted"
    data-testid="detail-loading"
  >
    正在加载详情…
  </p>
  <div
    v-else-if="detailStatus === 'error'"
    class="lr-alert lr-alert-danger"
    data-testid="detail-error"
    role="alert"
  >
    {{ detailError ?? '加载详情失败。' }}
  </div>
  <section
    v-else-if="item"
    class="media-detail"
  >
    <div class="detail-hero">
      <div class="poster-panel">
        <img
          v-if="posterSource"
          class="poster"
          data-testid="detail-poster"
          :src="posterSource"
          :alt="item.name"
        >
        <div
          v-else
          class="poster poster-placeholder"
          data-testid="detail-poster"
          aria-hidden="true"
        />
      </div>

      <div class="detail-main">
        <header>
          <h1>{{ item.name }}</h1>
          <p class="meta-line">
            <span
              v-if="item.productionYear != null"
              data-testid="year"
            >{{ item.productionYear }}</span>
            <span v-if="item.productionYear != null && mediaSummary"> · </span>
            <span
              v-if="mediaSummary"
              data-testid="media-summary"
            >{{ mediaSummary }}</span>
          </p>
        </header>

        <div
          v-if="item.kind === 'movie' || item.kind === 'episode'"
          class="actions"
        >
          <button
            class="lr-btn-primary lr-btn-lg"
            data-testid="play"
            type="button"
            @click="playFromStart"
          >
            播放
          </button>
          <button
            v-if="canResume"
            class="lr-btn-secondary lr-btn-lg"
            data-testid="resume"
            type="button"
            @click="resumePlayback"
          >
            继续播放 {{ formatClock(item.playbackPositionSeconds) }}
          </button>
        </div>

        <p
          v-if="item.overview"
          class="overview"
        >
          {{ item.overview }}
        </p>
      </div>
    </div>

    <PlayerControls />

    <section
      v-if="item.kind === 'series'"
      class="series-nav"
      aria-label="季与剧集"
    >
      <h2>剧集</h2>
      <ul class="season-list">
        <li
          v-for="season in seasons"
          :key="season.id"
        >
          <button
            type="button"
            class="season-chip"
            :data-season-id="season.id"
            :aria-pressed="selectedSeasonId === season.id"
            @click="selectSeason(season.id)"
          >
            {{ season.name }}
          </button>
        </li>
      </ul>

      <ul
        v-if="episodes.length > 0"
        class="episode-list"
      >
        <li
          v-for="episode in episodes"
          :key="episode.id"
        >
          <RouterLink :to="`/media/${episode.id}`">
            <span v-if="episode.indexNumber != null">E{{ String(episode.indexNumber).padStart(2, '0') }} · </span>
            {{ episode.name }}
          </RouterLink>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.media-detail {
  display: grid;
  gap: 1.35rem;
  max-width: 56rem;
}

.detail-hero {
  display: grid;
  grid-template-columns: minmax(9.5rem, 13rem) minmax(0, 1fr);
  gap: 1.75rem;
  align-items: start;
  padding: 1.35rem 1.4rem;
  background: var(--lr-surface);
  border: 1px solid var(--lr-border);
  border-radius: var(--lr-radius-lg);
  box-shadow: var(--lr-shadow);
}

.poster {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: var(--lr-radius-md);
  background: linear-gradient(160deg, #dfe7f1 0%, #c9d5e4 100%);
  box-shadow: var(--lr-shadow-md);
}

.poster-placeholder {
  min-height: 0;
}

.detail-main {
  display: grid;
  gap: 1.15rem;
  align-content: start;
  min-width: 0;
  padding-top: 0.15rem;
}

header {
  display: grid;
  gap: 0.4rem;
}

.meta-line {
  color: var(--lr-text-secondary);
  font-size: var(--lr-font-base);
}

.overview {
  line-height: 1.6;
  color: var(--lr-text-secondary);
  font-size: var(--lr-font-base);
  white-space: pre-wrap;
  max-width: 42rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.series-nav {
  display: grid;
  gap: 0.85rem;
  padding: 1.1rem 1.15rem;
  background: var(--lr-surface);
  border: 1px solid var(--lr-border);
  border-radius: var(--lr-radius-md);
  box-shadow: var(--lr-shadow);
}

.season-list,
.episode-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.season-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.season-chip {
  border-radius: 999px;
  min-height: 1.85rem;
  padding: 0 0.85rem;
  font-size: var(--lr-font-sm);
  box-shadow: none;
  background: var(--lr-canvas);
}

.season-chip[aria-pressed='true'] {
  border-color: transparent;
  background: var(--lr-accent-soft);
  color: var(--lr-accent);
  font-weight: 650;
}

.episode-list {
  display: grid;
  gap: 0.25rem;
}

.episode-list a {
  display: block;
  padding: 0.7rem 0.8rem;
  border-radius: var(--lr-radius-sm);
  text-decoration: none;
  border: 1px solid transparent;
  font-size: var(--lr-font-md);
  transition:
    background var(--lr-ease),
    border-color var(--lr-ease);
}

.episode-list a:hover {
  background: var(--lr-canvas);
  border-color: var(--lr-border);
}

@media (max-width: 640px) {
  .detail-hero {
    grid-template-columns: 1fr;
  }

  .poster-panel {
    max-width: 11rem;
  }
}
</style>
