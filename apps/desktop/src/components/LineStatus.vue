<script setup lang="ts">
import { computed } from 'vue'
import { lineStatusMessage, type LineStatusState } from '../stores/line-status'

const props = defineProps<{
  status: LineStatusState
}>()

const message = computed(() => lineStatusMessage(props.status))
</script>

<template>
  <p
    v-if="message"
    data-testid="line-status"
    class="line-status"
    :data-state="status.state"
  >
    {{ message }}
  </p>
</template>

<style scoped>
.line-status {
  margin: 0;
  padding: 0.55rem 0.75rem;
  border-radius: var(--lr-radius-sm);
  font-size: var(--lr-font-md);
  border: 1px solid var(--lr-border);
  background: var(--lr-canvas);
}

.line-status[data-state='testing'] {
  color: var(--lr-warning);
  border-color: color-mix(in srgb, var(--lr-warning) 30%, var(--lr-border));
  background: color-mix(in srgb, var(--lr-warning) 8%, var(--lr-surface));
}

.line-status[data-state='success'] {
  color: var(--lr-success);
  border-color: color-mix(in srgb, var(--lr-success) 28%, var(--lr-border));
  background: color-mix(in srgb, var(--lr-success) 8%, var(--lr-surface));
}

.line-status[data-state='failure'] {
  color: var(--lr-danger);
  border-color: color-mix(in srgb, var(--lr-danger) 28%, var(--lr-border));
  background: var(--lr-danger-soft);
}
</style>
