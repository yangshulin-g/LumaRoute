<script setup lang="ts">
import { usePlayerStore } from '../stores/player-store'

const playerStore = usePlayerStore()

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
    class="player-controls"
    data-testid="player-controls"
    :data-state="playerStore.state"
  >
    <div class="status-row">
      <p
        class="state-label"
        data-testid="player-state"
      >
        {{
          playerStore.state === 'playing'
            ? '播放中'
            : playerStore.state === 'paused'
              ? '已暂停'
              : playerStore.state === 'loading'
                ? '加载中'
                : playerStore.state === 'error'
                  ? '出错'
                  : playerStore.state
        }}
      </p>
      <p
        class="position"
        data-testid="player-position"
      >
        {{ formatClock(playerStore.positionSeconds) }} /
        {{ formatClock(playerStore.durationSeconds) }}
      </p>
    </div>

    <div
      v-if="playerStore.state === 'error' && playerStore.lastError"
      class="lr-alert lr-alert-danger error-panel"
      data-testid="player-error"
      role="alert"
    >
      {{ playerStore.lastError }}
    </div>

    <input
      data-testid="player-seek"
      type="range"
      min="0"
      :max="Math.max(playerStore.durationSeconds, 0)"
      :value="playerStore.positionSeconds"
      @change="onSeek"
    >
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
  background: var(--lr-surface);
  border: 1px solid var(--lr-border);
  border-radius: var(--lr-radius-md);
  box-shadow: var(--lr-shadow);
}

.player-controls[data-state='error'] {
  border-color: color-mix(in srgb, var(--lr-danger) 22%, var(--lr-border));
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1rem;
}

.state-label {
  margin: 0;
  font-weight: 650;
  font-size: var(--lr-font-base);
}

.position {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-size: var(--lr-font-sm);
  color: var(--lr-text-secondary);
}

.error-panel {
  font-size: var(--lr-font-md);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
</style>
