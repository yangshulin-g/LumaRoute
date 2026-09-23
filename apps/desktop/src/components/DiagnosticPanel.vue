<script setup lang="ts">
import { computed, ref } from 'vue'
import { userActionFor, type DiagnosticUserAction } from '@lumaroute/core'

const props = defineProps<{
  code?: string | null
  report: string
  copyReport?: () => Promise<void> | void
}>()

const action = computed<DiagnosticUserAction>(() => userActionFor(props.code ?? undefined))
const copyStatus = ref<{ state: 'success' | 'failure'; message: string } | null>(null)

async function writeReport(): Promise<void> {
  if (props.copyReport) {
    await props.copyReport()
    return
  }
  if (typeof globalThis.navigator === 'undefined' || !globalThis.navigator.clipboard?.writeText) {
    throw new Error('Clipboard is unavailable')
  }
  await globalThis.navigator.clipboard.writeText(props.report)
}

async function onCopy(): Promise<void> {
  copyStatus.value = null
  try {
    await writeReport()
    copyStatus.value = { state: 'success', message: '诊断信息已复制' }
  } catch {
    copyStatus.value = { state: 'failure', message: '复制失败' }
  }
}
</script>

<template>
  <section
    class="diagnostic-panel"
    data-testid="diagnostic-panel"
  >
    <p
      v-if="code"
      class="code"
      data-testid="diagnostic-code"
    >
      错误：{{ code }}
    </p>
    <p
      class="action"
      data-testid="diagnostic-action"
    >
      建议操作：{{ action }}
    </p>
    <div class="copy-row">
      <button
        type="button"
        class="lr-btn-secondary"
        data-testid="copy-diagnostics"
        @click="onCopy"
      >
        复制诊断信息
      </button>
      <p
        v-if="copyStatus"
        role="status"
        class="copy-status"
        :data-state="copyStatus.state"
      >
        {{ copyStatus.message }}
      </p>
    </div>
    <pre
      data-testid="diagnostic-report"
      class="report"
    >{{ report }}</pre>
  </section>
</template>

<style scoped>
.diagnostic-panel {
  display: grid;
  gap: 0.7rem;
  text-align: left;
}

.code,
.action {
  margin: 0;
  font-size: var(--lr-font-md);
}

.code {
  font-weight: 600;
}

.action {
  color: var(--lr-text-secondary);
}

.copy-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.copy-status {
  margin: 0;
  font-size: var(--lr-font-sm);
}

.copy-status[data-state='success'] {
  color: var(--lr-success);
}

.copy-status[data-state='failure'] {
  color: var(--lr-danger);
}

.report {
  margin: 0;
  padding: 0.85rem 0.9rem;
  overflow: auto;
  max-height: 16rem;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--lr-border);
  border-radius: var(--lr-radius-sm);
  background: var(--lr-canvas);
  font: 0.8rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--lr-text-secondary);
}
</style>
