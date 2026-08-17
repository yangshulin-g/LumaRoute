<script setup lang="ts">
import { computed } from 'vue'
import { userActionFor, type DiagnosticUserAction } from '@lumaroute/core'

const props = defineProps<{
  code?: string | null
  report: string
  copyReport?: () => Promise<void> | void
}>()

const action = computed<DiagnosticUserAction>(() => userActionFor(props.code ?? undefined))

async function onCopy(): Promise<void> {
  if (props.copyReport) {
    await props.copyReport()
    return
  }
  if (typeof globalThis.navigator !== 'undefined' && globalThis.navigator.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(props.report)
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
    <button
      type="button"
      class="lr-btn-secondary"
      data-testid="copy-diagnostics"
      @click="onCopy"
    >
      复制诊断信息
    </button>
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

button {
  justify-self: start;
}
</style>
