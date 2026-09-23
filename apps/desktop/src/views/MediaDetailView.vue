<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { AppError, type MediaItem } from '@lumaroute/core'
import PlayerControls from '../components/PlayerControls.vue'
import { injectServices } from '../composition/inject-services'
import { mediaKindLabel } from '../presentation/media-presenters'
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

const item = computed(() => mediaStore.detailItem)
const seasons = computed(() =>
  mediaStore.detailChildren.filter((entry) => entry.kind === 'season'),
)
const canResume = computed(() => (item.value?.playbackPositionSeconds ?? 0) > 0)
const runtimeLabel = computed(() => formatRuntime(item.value?.runtimeSeconds ?? null))

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
    <div
      data-testid="detail-hero"
      class="detail-hero aurora-hero"
    >
      <div
        class="hero-glow"
        aria-hidden="true"
      />
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
          <p class="eyebrow">
            {{ mediaKindLabel(item.kind) }}
          </p>
          <h1>{{ item.name }}</h1>
          <p
            v-if="item.productionYear != null || runtimeLabel"
            class="meta-line"
          >
            <span
              v-if="item.productionYear != null"
              data-testid="year"
            >{{ item.productionYear }}</span>
            <span v-if="item.productionYear != null && runtimeLabel"> · </span>
            <span
              v-if="runtimeLabel"
              data-testid="media-summary"
            >{{ runtimeLabel }}</span>
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
      class="series-nav lr-glass-card"
      aria-label="季与剧集"
    >
      <div class="deck-heading">
        <h2>选集</h2>
        <span class="lr-muted">{{ episodes.length ? `当前季 ${episodes.length} 集` : '请选择季' }}</span>
      </div>
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
        class="episode-deck"
        data-testid="episode-deck"
      >
        <li
          v-for="episode in episodes"
          :key="episode.id"
        >
          <RouterLink
            :to="`/media/${episode.id}`"
            class="episode-chip"
          >
            <span
              v-if="episode.indexNumber != null"
              class="episode-index"
            >E{{ String(episode.indexNumber).padStart(2, '0') }}</span>
            <span class="episode-name">{{ episode.name }}</span>
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
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(9.5rem, 13rem) minmax(0, 1fr);
  gap: 1.75rem;
  align-items: start;
  padding: 1.6rem 1.6rem;
  background: var(--lr-surface-card-solid);
  border: 1px solid var(--lr-border-subtle);
  border-radius: var(--lr-radius-lg);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 8%),
    var(--lr-shadow);
}

.hero-glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(60% 80% at 12% 0%, rgb(6 182 212 / 22%) 0%, transparent 70%),
    radial-gradient(50% 70% at 88% 12%, rgb(139 92 246 / 20%) 0%, transparent 72%),
    radial-gradient(70% 60% at 50% 110%, rgb(59 130 246 / 16%) 0%, transparent 70%);
}

.poster {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: var(--lr-radius-md);
  background: linear-gradient(160deg, var(--lr-surface-muted) 0%, var(--lr-bg-canvas) 100%);
  border: 1px solid var(--lr-border-subtle);
  box-shadow: var(--lr-shadow-poster), var(--lr-shadow-md);
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

.eyebrow {
  margin: 0;
  color: var(--lr-accent-cyan);
  font-size: var(--lr-font-xs);
  font-weight: 650;
  letter-spacing: 0.12em;
  text-transform: uppercase;
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
}

.deck-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.deck-heading span {
  font-size: var(--lr-font-sm);
}

.season-list,
.episode-deck {
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
  border: 1px solid var(--lr-border-subtle);
  transition:
    background var(--lr-ease),
    border-color var(--lr-ease),
    color var(--lr-ease);
}

.season-chip:hover {
  border-color: var(--lr-border-hover);
}

.season-chip[aria-pressed='true'] {
  border-color: var(--lr-border-hover);
  background: var(--lr-accent-soft);
  color: var(--lr-accent);
  font-weight: 650;
}

.season-chip:focus-visible,
.episode-chip:focus-visible {
  outline: none;
  box-shadow: var(--lr-focus-ring);
}

.episode-deck {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: 0.5rem;
}

.episode-chip {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
  padding: 0.65rem 0.8rem;
  border-radius: var(--lr-radius-sm);
  text-decoration: none;
  color: var(--lr-text-primary);
  background: var(--lr-surface-muted);
  border: 1px solid var(--lr-border-subtle);
  font-size: var(--lr-font-md);
  transition:
    background var(--lr-ease),
    border-color var(--lr-ease);
}

.episode-chip:hover {
  background: var(--lr-surface-card-hover);
  border-color: var(--lr-border-hover);
}

.episode-index {
  flex: none;
  color: var(--lr-accent-cyan);
  font-size: var(--lr-font-xs);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.episode-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
