<script setup lang="ts">
import type { ServerProfile } from '@lumaroute/core'
import { connectionStatusLabel } from '../stores/connection-status-label'
import type { ServerConnectionStatus } from '../stores/server-connection-status'

const props = defineProps<{
  profiles: readonly ServerProfile[]
  activeId: string | null
  statusById?: Readonly<Record<string, ServerConnectionStatus>>
}>()

const emit = defineEmits<{
  select: [profileId: string]
  retry: [profileId: string]
}>()

function statusFor(profileId: string): ServerConnectionStatus {
  return props.statusById?.[profileId] ?? 'unknown'
}
</script>

<template>
  <nav
    class="server-switcher"
    aria-label="服务器"
    data-testid="server-switcher"
  >
    <h2>服务器</h2>
    <ul>
      <li
        v-for="profile in profiles"
        :key="profile.id"
      >
        <div class="server-row">
          <button
            type="button"
            class="nav-item"
            :data-testid="`switch-server-${profile.id}`"
            :aria-current="profile.id === activeId ? 'true' : undefined"
            @click="emit('select', profile.id)"
          >
            <span
              class="health-dot"
              :data-testid="`server-health-${profile.id}`"
              :data-status="statusFor(profile.id)"
              :title="connectionStatusLabel(statusFor(profile.id))"
              :aria-label="connectionStatusLabel(statusFor(profile.id))"
            />
            <span class="server-name">{{ profile.name }}</span>
          </button>
          <button
            v-if="statusFor(profile.id) === 'unhealthy'"
            type="button"
            class="retry-button"
            :data-testid="`server-retry-${profile.id}`"
            :aria-label="`重试连接 ${profile.name}`"
            @click.stop="emit('retry', profile.id)"
          >
            重试
          </button>
        </div>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.server-switcher {
  display: grid;
  gap: 0.4rem;
}

h2 {
  margin: 0;
  padding: 0 0.7rem;
  font-size: 0.6875rem;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--lr-text-tertiary);
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.15rem;
}

.server-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.25rem;
  align-items: center;
}

.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-align: left;
  border: 0;
  border-radius: var(--lr-radius-sm);
  background: transparent;
  padding: 0.45rem 0.7rem;
  position: relative;
  min-width: 0;
  min-height: 2rem;
  box-shadow: none;
  font-weight: 500;
  font-size: var(--lr-font-md);
}

.nav-item:hover:not(:disabled) {
  background: var(--lr-surface-hover);
  border-color: transparent;
}

.nav-item[aria-current='true'] {
  background: var(--lr-accent-soft);
  color: var(--lr-text);
  font-weight: 650;
}

.nav-item[aria-current='true']::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.4rem;
  bottom: 0.4rem;
  width: 3px;
  border-radius: 999px;
  background: var(--lr-accent);
}

.health-dot {
  flex: 0 0 auto;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: #94a3b8;
}

.health-dot[data-status='healthy'] {
  background: #16a34a;
}

.health-dot[data-status='unhealthy'] {
  background: var(--lr-danger);
}

.health-dot[data-status='checking'] {
  background: #ca8a04;
  animation: lr-health-pulse 1.1s ease-in-out infinite;
}

.server-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.retry-button {
  min-height: 1.65rem;
  border: 1px solid var(--lr-border);
  border-radius: var(--lr-radius-xs);
  background: var(--lr-surface);
  color: var(--lr-text-secondary);
  padding: 0 0.45rem;
  font-size: var(--lr-font-xs);
  font-weight: 500;
  line-height: 1.2;
  box-shadow: none;
}

.retry-button:hover {
  color: var(--lr-text);
  border-color: color-mix(in srgb, var(--lr-accent) 35%, var(--lr-border));
  background: var(--lr-surface-hover);
}

@keyframes lr-health-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
