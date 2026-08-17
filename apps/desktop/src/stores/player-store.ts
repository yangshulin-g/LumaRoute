import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { PlaybackPlan } from '@lumaroute/player'
import { injectServices } from '../composition/inject-services'

function playbackErrorMessage(error: unknown): string {
  const raw = rawPlaybackError(error)
  return localizePlayerError(raw)
}

function rawPlaybackError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Playback failed'
}

/** Map leftover English native errors to actionable Chinese copy. */
export function localizePlayerError(message: string): string {
  if (/mpv ipc socket did not appear|mpv named pipe did not appear/i.test(message)) {
    return '等待播放器 IPC 套接字超时。请确认已运行 pnpm fetch:mpv，且 mpv 可正常启动后重试。'
  }
  if (/packaged mpv sidecar missing/i.test(message)) {
    return '未找到 mpv 播放器。请在仓库根目录运行 pnpm fetch:mpv 后重试。'
  }
  if (/unable to parse mpv --version|mpv --version failed/i.test(message)) {
    return '无法识别 mpv 版本。请重新运行 pnpm fetch:mpv 后重试。'
  }
  if (message === 'Playback failed') {
    return '播放失败'
  }
  return message
}

export const usePlayerStore = defineStore('player', () => {
  const services = injectServices()
  const reporter = services.progressReporter
  const state = ref<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle')
  const lastError = ref<string | null>(null)
  const positionSeconds = ref(0)
  const durationSeconds = ref(0)
  const activePlan = shallowRef<PlaybackPlan | null>(null)
  const activeLineId = ref<string | null>(null)
  const activeProfileId = ref<string | null>(null)

  services.player.subscribe((event) => {
    if (
      event.type === 'started' ||
      event.type === 'position' ||
      event.type === 'paused' ||
      event.type === 'resumed' ||
      event.type === 'seeked'
    ) {
      positionSeconds.value = event.positionSeconds
      durationSeconds.value = event.durationSeconds
    }
    if (event.type === 'started' || event.type === 'resumed') state.value = 'playing'
    if (event.type === 'paused') state.value = 'paused'
    if (event.type === 'ended' || event.type === 'stopped') {
      state.value = 'idle'
      lastError.value = null
    }
    if (event.type === 'error') {
      state.value = 'error'
      lastError.value = event.message
    }
    void reporter.handle(event)
  })

  async function play(
    profileId: string,
    itemId: string,
    startPositionSeconds = 0,
  ): Promise<void> {
    state.value = 'loading'
    lastError.value = null
    try {
      const result = await services.playback.play(profileId, itemId, startPositionSeconds)
      activePlan.value = result.plan
      activeLineId.value = result.lineId
      activeProfileId.value = profileId
      positionSeconds.value = result.plan.startPositionSeconds
      durationSeconds.value = result.plan.durationSeconds
      state.value = 'playing'
      reporter.start(result.plan, (report) => services.media.reportPlayback(profileId, report))
      await reporter.handle({
        type: 'started',
        positionSeconds: result.plan.startPositionSeconds,
        durationSeconds: result.plan.durationSeconds,
      })
    } catch (error) {
      state.value = 'error'
      lastError.value = playbackErrorMessage(error)
      throw error
    }
  }

  async function shutdown(): Promise<void> {
    await reporter.flushAndStop('app-exit')
    await services.player.stop()
  }

  async function stop(): Promise<void> {
    await services.player.stop()
    state.value = 'idle'
    lastError.value = null
  }

  return {
    state,
    lastError,
    positionSeconds,
    durationSeconds,
    activePlan,
    activeLineId,
    activeProfileId,
    play,
    shutdown,
    pause: () => services.player.pause(),
    resume: () => services.player.resume(),
    seek: (seconds: number) => services.player.seek(seconds),
    stop,
  }
})
