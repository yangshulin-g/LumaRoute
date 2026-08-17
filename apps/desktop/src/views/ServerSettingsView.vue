<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ServerLine, ServerProfile } from '@lumaroute/core'
import DiagnosticPanel from '../components/DiagnosticPanel.vue'
import LineEditor from '../components/LineEditor.vue'
import LineStatus from '../components/LineStatus.vue'
import { CONNECTION_STATUS_LEGEND } from '../stores/connection-status-label'
import { toLineStatusReason, type LineStatusState } from '../stores/line-status'

const props = defineProps<{
  profiles: readonly ServerProfile[]
  profile: ServerProfile
  activeServerId: string | null
  activeLineId: string | null
  sensitiveLineIds?: readonly string[]
  diagnosticCode?: string | null
  diagnosticReport?: string
  selectServer: (profileId: string) => Promise<void> | void
  reorderServers: (profileIds: readonly string[]) => Promise<void> | void
  deleteServer: (profileId: string) => Promise<void> | void
  renameServer?: (profileId: string, name: string) => Promise<void> | void
  addLine: (draft: ServerLine) => Promise<void>
  saveProfile?: (profile: ServerProfile) => Promise<void>
  setPreferredLine: (profileId: string, lineId: string) => Promise<void> | void
  setLineSensitive?: (lineId: string, sensitive: boolean) => Promise<void> | void
  copyDiagnostics?: () => Promise<void> | void
  updateLines?: (
    profileId: string,
    lines: ServerLine[],
    preferredLineId: string,
  ) => Promise<void> | void
}>()

const markedSensitive = computed(() => new Set(props.sensitiveLineIds ?? []))

const lineStatus = ref<LineStatusState>({ state: 'idle' })
const selectedLineId = ref(props.activeLineId ?? props.profile.preferredLineId)
const pendingDeleteId = ref<string | null>(null)
const draftName = ref(props.profile.name)

watch(
  () => props.activeLineId,
  (value) => {
    if (value) selectedLineId.value = value
  },
)

watch(
  () => props.profile.id,
  () => {
    selectedLineId.value = props.activeLineId ?? props.profile.preferredLineId
    draftName.value = props.profile.name
  },
)

watch(
  () => props.profile.name,
  (name) => {
    draftName.value = name
  },
)

const activeLineLabel = computed(() => {
  const line =
    props.profile.lines.find((entry) => entry.id === selectedLineId.value) ??
    props.profile.lines.find((entry) => entry.id === props.profile.preferredLineId)
  return line?.label ?? '未知'
})

const sortedLines = computed(() =>
  [...props.profile.lines].sort((left, right) => left.priority - right.priority),
)

async function onAddLine(draft: ServerLine): Promise<void> {
  lineStatus.value = { state: 'testing' }
  try {
    await props.addLine(draft)
    lineStatus.value = { state: 'success', lineId: draft.id }
  } catch (error) {
    lineStatus.value = {
      state: 'failure',
      reason: toLineStatusReason(error),
    }
  }
}

async function preferLine(lineId: string): Promise<void> {
  await props.setPreferredLine(props.profile.id, lineId)
  selectedLineId.value = lineId
}

async function moveProfileUp(profileId: string): Promise<void> {
  const ids = props.profiles.map((entry) => entry.id)
  const index = ids.indexOf(profileId)
  if (index <= 0) return
  const next = [...ids]
  ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
  await props.reorderServers(next)
}

function requestDelete(profileId: string): void {
  pendingDeleteId.value = profileId
}

async function confirmDelete(): Promise<void> {
  if (!pendingDeleteId.value) return
  const profileId = pendingDeleteId.value
  pendingDeleteId.value = null
  await props.deleteServer(profileId)
}

function cancelDelete(): void {
  pendingDeleteId.value = null
}

async function toggleLine(lineId: string): Promise<void> {
  if (!props.updateLines) return
  const lines = props.profile.lines.map((line) =>
    line.id === lineId ? { ...line, enabled: !line.enabled } : line,
  )
  await props.updateLines(props.profile.id, lines, props.profile.preferredLineId)
}

async function moveLine(lineId: string, direction: -1 | 1): Promise<void> {
  if (!props.updateLines) return
  const ordered = sortedLines.value.map((line) => ({ ...line }))
  const index = ordered.findIndex((line) => line.id === lineId)
  const swapIndex = index + direction
  if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return
  ;[ordered[index], ordered[swapIndex]] = [ordered[swapIndex]!, ordered[index]!]
  const lines = ordered.map((line, priority) => ({ ...line, priority }))
  await props.updateLines(props.profile.id, lines, props.profile.preferredLineId)
}

async function renameCurrent(): Promise<void> {
  if (!props.renameServer) return
  const name = draftName.value.trim()
  if (!name || name === props.profile.name) return
  await props.renameServer(props.profile.id, name)
}

async function onSensitiveChange(lineId: string, event: Event): Promise<void> {
  if (!props.setLineSensitive) return
  const checked = (event.target as HTMLInputElement).checked
  await props.setLineSensitive(lineId, checked)
}
</script>

<template>
  <section class="server-settings">
    <header class="page-header">
      <h1>服务器与线路</h1>
      <p class="lr-muted">
        管理已保存的服务器、线路顺序与诊断信息
      </p>
    </header>

    <section class="panel">
      <h2>服务器列表</h2>
      <ul class="profiles">
        <li
          v-for="entry in profiles"
          :key="entry.id"
          class="profile-row"
        >
          <button
            type="button"
            class="profile-select"
            :data-testid="`server-${entry.id}`"
            :aria-current="entry.id === activeServerId ? 'true' : undefined"
            @click="selectServer(entry.id)"
          >
            {{ entry.name }}
          </button>
          <div class="profile-actions">
            <button
              type="button"
              class="lr-btn-ghost lr-btn-sm"
              :data-testid="`move-${entry.id}-up`"
              :disabled="profiles[0]?.id === entry.id"
              @click="moveProfileUp(entry.id)"
            >
              上移
            </button>
            <button
              type="button"
              class="lr-btn-danger lr-btn-sm"
              :data-testid="`delete-${entry.id}`"
              @click="requestDelete(entry.id)"
            >
              删除
            </button>
          </div>
        </li>
      </ul>
      <div
        v-if="pendingDeleteId"
        class="confirm-delete"
        data-testid="confirm-delete"
      >
        <p>删除此服务器及其已保存凭证？</p>
        <div class="confirm-actions">
          <button
            type="button"
            class="lr-btn-danger"
            data-testid="confirm-delete-yes"
            @click="confirmDelete"
          >
            确认删除
          </button>
          <button
            type="button"
            class="lr-btn-secondary"
            data-testid="confirm-delete-no"
            @click="cancelDelete"
          >
            取消
          </button>
        </div>
      </div>
    </section>

    <section class="panel active-profile">
      <h2>当前配置</h2>
      <label class="lr-field">
        <span>名称</span>
        <input
          :key="profile.id"
          v-model="draftName"
          data-testid="rename-server"
          @change="renameCurrent"
        >
      </label>
      <p
        class="lr-muted"
        data-testid="active-line"
      >
        当前线路：{{ activeLineLabel }}
      </p>

      <h3>线路</h3>
      <ul
        class="lines"
        data-testid="line-list"
      >
        <li
          v-for="line in sortedLines"
          :key="line.id"
          class="line-row"
          :data-testid="`line-item-${line.id}`"
        >
          <div class="line-meta">
            <span class="line-label">{{ line.label }}</span>
            <span class="line-url lr-muted">{{ line.baseUrl }}</span>
          </div>
          <div class="line-actions">
            <button
              type="button"
              class="lr-btn-secondary lr-btn-sm"
              :data-testid="`toggle-${line.id}`"
              @click="toggleLine(line.id)"
            >
              {{ line.enabled ? '停用' : '启用' }}
            </button>
            <button
              type="button"
              class="lr-btn-ghost lr-btn-sm"
              :data-testid="`move-line-${line.id}-up`"
              @click="moveLine(line.id, -1)"
            >
              上移
            </button>
            <button
              type="button"
              class="lr-btn-ghost lr-btn-sm"
              :data-testid="`move-line-${line.id}-down`"
              @click="moveLine(line.id, 1)"
            >
              下移
            </button>
            <button
              type="button"
              class="lr-btn-secondary lr-btn-sm"
              :data-testid="`prefer-${line.id}`"
              @click="preferLine(line.id)"
            >
              设为首选
            </button>
            <label
              class="sensitive-toggle"
              :data-testid="`sensitive-${line.id}`"
            >
              <input
                type="checkbox"
                :checked="markedSensitive.has(line.id)"
                @change="onSensitiveChange(line.id, $event)"
              >
              诊断中隐藏地址
            </label>
          </div>
        </li>
      </ul>

      <h3>添加线路</h3>
      <LineEditor @add="onAddLine" />
      <LineStatus :status="lineStatus" />
    </section>

    <section
      v-if="diagnosticReport"
      class="panel"
    >
      <h2>诊断</h2>
      <p
        class="lr-muted"
        data-testid="connection-status-legend"
      >
        {{ CONNECTION_STATUS_LEGEND }}
      </p>
      <DiagnosticPanel
        :code="diagnosticCode ?? null"
        :report="diagnosticReport"
        v-bind="copyDiagnostics ? { copyReport: copyDiagnostics } : {}"
      />
    </section>
  </section>
</template>

<style scoped>
.server-settings {
  display: grid;
  gap: 1.15rem;
  max-width: 48rem;
  text-align: left;
}

.page-header {
  display: grid;
  gap: 0.25rem;
}

.panel {
  display: grid;
  gap: 0.9rem;
  padding: 1.2rem 1.25rem;
  background: var(--lr-surface);
  border: 1px solid var(--lr-border);
  border-radius: var(--lr-radius-md);
  box-shadow: var(--lr-shadow);
}

.profiles,
.lines {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.5rem;
}

.profile-row,
.line-row {
  display: grid;
  gap: 0.55rem;
  padding: 0.8rem 0.85rem;
  border: 1px solid var(--lr-border);
  border-radius: var(--lr-radius-sm);
  background: var(--lr-canvas);
}

.profile-row {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.profile-select {
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.2rem 0.3rem;
  font-weight: 550;
  min-height: auto;
  box-shadow: none;
  justify-content: flex-start;
}

.profile-select:hover:not(:disabled) {
  background: transparent;
  border-color: transparent;
  color: var(--lr-accent);
}

.profile-select[aria-current='true'] {
  color: var(--lr-accent);
  font-weight: 650;
}

.profile-actions,
.line-actions,
.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.line-meta {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}

.line-label {
  font-weight: 650;
}

.line-url {
  font-size: var(--lr-font-sm);
  overflow-wrap: anywhere;
}

.sensitive-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: var(--lr-font-sm);
  color: var(--lr-text-secondary);
  margin-left: 0.15rem;
}

.confirm-delete {
  display: grid;
  gap: 0.65rem;
  padding: 0.9rem 1rem;
  border: 1px solid color-mix(in srgb, var(--lr-danger) 28%, var(--lr-border));
  border-radius: var(--lr-radius-sm);
  background: var(--lr-danger-soft);
}

.confirm-delete p {
  margin: 0;
  font-size: var(--lr-font-md);
  color: var(--lr-danger);
}
</style>
