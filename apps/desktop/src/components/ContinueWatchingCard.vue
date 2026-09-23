<script setup lang="ts">
import { computed } from 'vue'
import type { MediaItem } from '@lumaroute/core'
import { progressPercent } from '../presentation/media-presenters'
import MediaCard from './MediaCard.vue'

const props = defineProps<{ item: MediaItem; profileId: string }>()
const percent = computed(() => progressPercent(props.item))
</script>

<template>
  <article class="continue-card">
    <MediaCard
      :item="item"
      :profile-id="profileId"
    />
    <div
      v-if="percent != null"
      class="progress-row"
    >
      <progress
        :value="percent"
        max="100"
        :aria-label="`${item.name} 已播放 ${percent}%`"
      />
      <span
        class="progress-value"
        data-testid="continue-progress"
      >{{ percent }}%</span>
    </div>
  </article>
</template>

<style scoped>
.continue-card {
  display: grid;
  gap: 0.5rem;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

progress {
  flex: 1 1 auto;
  height: 0.3rem;
  border: 0;
  border-radius: 999px;
  overflow: hidden;
  appearance: none;
  background: var(--lr-surface-active);
}

progress::-webkit-progress-bar {
  background: var(--lr-surface-active);
}

progress::-webkit-progress-value {
  background: linear-gradient(90deg, var(--lr-accent-cyan), var(--lr-accent-blue));
}

progress::-moz-progress-bar {
  background: linear-gradient(90deg, var(--lr-accent-cyan), var(--lr-accent-blue));
}

.progress-value {
  font-size: var(--lr-font-xs);
  color: var(--lr-text-tertiary);
  font-variant-numeric: tabular-nums;
}
</style>
