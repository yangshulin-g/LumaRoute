<script setup lang="ts">
import { computed } from 'vue'
import { playbackPlanFacts } from '../presentation/media-presenters'
import { resolveLine } from '../presentation/line-presenters'
import { usePlayerStore } from '../stores/player-store'
import { useServerStore } from '../stores/server-store'

const playerStore = usePlayerStore()
const serverStore = useServerStore()

const planFacts = computed(() =>
  playerStore.activePlan ? playbackPlanFacts(playerStore.activePlan) : [],
)

const playbackProfile = computed(
  () => serverStore.profiles.find((profile) => profile.id === playerStore.activeProfileId) ?? null,
)

const playbackLineLabel = computed(
  () => resolveLine(playbackProfile.value, playerStore.activeLineId)?.label ?? null,
)

const localizedState = computed(() => {
  switch (playerStore.state) {
    case 'playing':
      return '播放中'
    case 'paused':
      return '已暂停'
    case 'loading':
      return '加载中'
    case 'error':
      return '出错'
    default:
      return playerStore.state
  }
})

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

async function onSeek(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  await playerStore.seek(Number(target.value))
}
</script>

<template>
  <div
    v-if="playerStore.state !== 'idle'"
    class="player-controls lr-glass-card"
    data-testid="player-controls"
    :data-state="playerStore.state"
  >
    <div class="hud-top">
      <p
        class="state-label"
        data-testid="player-state"
      >
        {{ localizedState }}
      </p>
      <div
        v-if="planFacts.length"
        class="fact-chips"
        data-testid="playback-facts"
      >
        <span
          v-for="(fact, index) in planFacts"
          :key="`${index}-${fact}`"
          class="fact-chip"
        >{{ fact }}</span>
        <span
          v-if="playbackLineLabel"
          class="fact-chip line-chip"
          data-testid="playback-line"
        >线路 {{ playbackLineLabel }}</span>
      </div>
    </div>

    <div
      v-if="playerStore.state === 'error' && playerStore.lastError"
      class="lr-alert lr-alert-danger error-panel"
      data-testid="player-error"
      role="alert"
    >
      {{ playerStore.lastError }}
    </div>

    <div
      class="timeline"
      data-testid="player-position"
    >
      <span class="clock">{{ formatClock(playerStore.positionSeconds) }}</span>
      <input
        aria-label="播放进度"
        data-testid="player-seek"
        type="range"
        min="0"
        :max="Math.max(playerStore.durationSeconds, 0)"
        :value="playerStore.positionSeconds"
        @change="onSeek"
      >
      <span class="clock">{{ formatClock(playerStore.durationSeconds) }}</span>
    </div>

    <div class="actions">
      <button
        v-if="playerStore.state === 'paused'"
        class="lr-btn-primary"
        data-testid="player-resume"
        type="button"
        @click="playerStore.resume()"
      >
        继续
      </button>
      <button
        v-else
        class="lr-btn-secondary"
        data-testid="player-pause"
        type="button"
        @click="playerStore.pause()"
      >
        暂停
      </button>
      <button
        class="lr-btn-ghost"
        data-testid="player-stop"
        type="button"
        @click="playerStore.stop()"
      >
        停止
      </button>
    </div>
  </div>
</template>

<style scoped>
.player-controls {
  display: grid;
  gap: 0.85rem;
  padding: 1rem 1.1rem;
  border-color: var(--lr-border-strong);
  transition: border-color var(--lr-ease);
}

.player-controls[data-state='error'] {
  border-color: color-mix(in srgb, var(--lr-danger) 40%, var(--lr-border));
}

.hud-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}

.state-label {
  margin: 0;
  font-weight: 650;
  font-size: var(--lr-font-base);
}

.player-controls[data-state='playing'] .state-label {
  color: var(--lr-accent);
}

.fact-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.fact-chip {
  padding: 0.15rem 0.55rem;
  font-size: var(--lr-font-xs);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--lr-text-secondary);
  background: var(--lr-surface-muted);
  border: 1px solid var(--lr-border);
  border-radius: 999px;
}

.line-chip {
  color: var(--lr-accent);
  background: var(--lr-accent-soft);
  border-color: var(--lr-border-hover);
}

.error-panel {
  font-size: var(--lr-font-md);
}

.timeline {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.timeline input[type='range'] {
  flex: 1;
  min-width: 0;
  accent-color: var(--lr-accent);
}

.clock {
  font-variant-numeric: tabular-nums;
  font-size: var(--lr-font-sm);
  color: var(--lr-text-secondary);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
</style>
