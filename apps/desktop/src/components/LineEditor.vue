<script setup lang="ts">
import { reactive } from 'vue'
import type { ServerLine } from '@lumaroute/core'

const emit = defineEmits<{
  add: [draft: ServerLine]
}>()

const draft = reactive({
  id: '',
  label: '',
  baseUrl: '',
  priority: 1,
  enabled: true,
})

function submit(): void {
  emit('add', {
    id: draft.id || globalThis.crypto.randomUUID(),
    label: draft.label.trim() || '线路',
    baseUrl: draft.baseUrl.trim(),
    priority: Number(draft.priority) || 0,
    enabled: draft.enabled,
  })
}
</script>

<template>
  <form
    class="line-editor"
    @submit.prevent="submit"
  >
    <div class="fields">
      <label class="lr-field">
        <span>标签</span>
        <input
          v-model.trim="draft.label"
          name="line-label"
          placeholder="例如：家里 / 公网"
        >
      </label>
      <label class="lr-field grow">
        <span>URL</span>
        <input
          v-model.trim="draft.baseUrl"
          name="line-base-url"
          type="url"
          placeholder="https://"
        >
      </label>
      <label class="lr-field priority">
        <span>优先级</span>
        <input
          v-model.number="draft.priority"
          name="line-priority"
          type="number"
          min="0"
        >
      </label>
    </div>
    <button
      type="button"
      class="lr-btn-primary"
      data-testid="add-line"
      @click="submit"
    >
      添加线路
    </button>
  </form>
</template>

<style scoped>
.line-editor {
  display: grid;
  gap: 0.75rem;
  padding: 0.9rem;
  border: 1px dashed var(--lr-border);
  border-radius: var(--lr-radius-sm);
  background: var(--lr-canvas);
}

.fields {
  display: grid;
  grid-template-columns: minmax(0, 8rem) minmax(0, 1fr) minmax(0, 5.5rem);
  gap: 0.65rem;
  align-items: end;
}

@media (max-width: 640px) {
  .fields {
    grid-template-columns: 1fr;
  }
}

button {
  justify-self: start;
}
</style>
