<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { AddServerInput, ServerKind } from '@lumaroute/core'
import { onboardingErrorMessage } from './onboarding-error-message'

type OnboardingInput = Omit<AddServerInput, 'deviceId' | 'appVersion'>

type AddServerResult = {
  id?: string
  serverName?: string
  serverId?: string
  profile?: { serverId: string }
}

const props = defineProps<{
  addServer: (input: OnboardingInput) => Promise<AddServerResult | void>
}>()

const form = reactive({
  kind: 'emby' as ServerKind,
  name: '',
  baseUrl: '',
  username: '',
  password: '',
})
const submitting = ref(false)
const result = ref<{ serverName: string; serverId: string } | null>(null)
const errorMessage = ref<string | null>(null)

async function submit(): Promise<void> {
  submitting.value = true
  errorMessage.value = null
  const password = form.password
  try {
    const response = await props.addServer({
      kind: form.kind,
      name: form.name,
      baseUrl: form.baseUrl,
      username: form.username,
      password,
    })
    form.password = ''
    result.value = {
      serverName: response?.serverName ?? form.name,
      serverId: response?.serverId ?? response?.profile?.serverId ?? response?.id ?? '',
    }
  } catch (error) {
    form.password = ''
    errorMessage.value = onboardingErrorMessage(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="onboarding-page">
    <div class="onboarding lr-card">
      <header>
        <p class="eyebrow">
          LumaRoute
        </p>
        <h1>光路</h1>
        <p class="lr-muted subtitle">
          连接第一台 Emby / Jellyfin 服务器
        </p>
      </header>
      <form @submit.prevent="submit">
        <label class="lr-field">
          <span>服务器类型</span>
          <select
            v-model="form.kind"
            name="kind"
          >
            <option value="emby">
              Emby
            </option>
            <option value="jellyfin">
              Jellyfin
            </option>
          </select>
        </label>
        <label class="lr-field">
          <span>显示名称</span>
          <input
            v-model.trim="form.name"
            name="name"
            required
          >
        </label>
        <label class="lr-field">
          <span>主线路 URL</span>
          <input
            v-model.trim="form.baseUrl"
            name="baseUrl"
            type="url"
            required
            placeholder="https://"
          >
        </label>
        <label class="lr-field">
          <span>用户名</span>
          <input
            v-model.trim="form.username"
            name="username"
            autocomplete="username"
            required
          >
        </label>
        <label class="lr-field">
          <span>密码</span>
          <input
            v-model="form.password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          >
        </label>
        <button
          class="lr-btn-primary lr-btn-lg submit"
          type="submit"
          :disabled="submitting"
        >
          {{ submitting ? '连接中…' : '连接' }}
        </button>
      </form>
      <div
        v-if="errorMessage"
        class="lr-alert lr-alert-danger"
        data-testid="onboarding-error"
        role="alert"
      >
        {{ errorMessage }}
      </div>
      <p
        v-if="result"
        class="result lr-muted"
        data-testid="onboarding-result"
      >
        {{ result.serverName }} · {{ result.serverId }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.onboarding-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.75rem 1.25rem;
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in srgb, var(--lr-accent) 12%, transparent), transparent),
    var(--lr-canvas);
}

.onboarding {
  display: grid;
  gap: 1.35rem;
  width: min(24.5rem, 100%);
  padding: 1.85rem 1.6rem 1.7rem;
  text-align: left;
  border-radius: var(--lr-radius-lg);
  box-shadow: var(--lr-shadow-md);
}

header {
  display: grid;
  gap: 0.25rem;
}

.eyebrow {
  margin: 0;
  font-size: var(--lr-font-xs);
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lr-accent);
}

h1 {
  font-size: 1.75rem;
  letter-spacing: 0.08em;
}

.subtitle {
  margin-top: 0.15rem;
}

form {
  display: grid;
  gap: 0.9rem;
}

.submit {
  width: 100%;
  margin-top: 0.25rem;
}

.result {
  font-size: var(--lr-font-sm);
  word-break: break-word;
  padding: 0.65rem 0.75rem;
  border-radius: var(--lr-radius-sm);
  background: var(--lr-canvas);
}
</style>
