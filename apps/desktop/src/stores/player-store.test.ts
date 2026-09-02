import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import type { PlaybackPlan, PlayerEvent } from '@lumaroute/player'
import { ProgressReporter, type Clock, type Logger, type TimerHandle } from '@lumaroute/core'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import { usePlayerStore } from './player-store'

const plan: PlaybackPlan = {
  itemId: 'item-1',
  mediaSourceId: 'source-1',
  playSessionId: 'session-1',
  streamUrl: 'https://primary.example/Videos/item-1/stream.mkv?Static=true&MediaSourceId=source-1',
  requestHeaders: { 'X-Emby-Token': 'token-a' },
  container: 'mkv',
  videoCodec: 'h264',
  audioCodec: 'aac',
  bitrate: 8_000_000,
  durationSeconds: 120,
  method: 'direct-play',
  startPositionSeconds: 0,
}

class IdleClock implements Clock {
  nowMs(): number {
    return 0
  }
  setTimeout(callback: () => void, delayMs: number): TimerHandle {
    void callback
    void delayMs
    return 0 as unknown as TimerHandle
  }
  clearTimeout(handle: TimerHandle): void {
    void handle
  }
}

function createPlayerStoreHarness() {
  let listener: ((event: PlayerEvent) => void) | null = null
  const engine = {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((next: (event: PlayerEvent) => void) => {
      listener = next
      return () => {
        listener = null
      }
    }),
  }
  const playback = {
    play: vi.fn().mockResolvedValue({ plan, lineId: 'line-1' }),
  }
  const reportPlayback = vi.fn().mockResolvedValue(undefined)
  const media = { reportPlayback }
  const logger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
  }
  const progressReporter = new ProgressReporter(new IdleClock(), logger)
  const services = {
    player: engine,
    playback,
    media,
    progressReporter,
  } as unknown as AppServices
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  setActivePinia(pinia)
  app.provide(servicesKey, services)

  return {
    engine,
    playback,
    reportPlayback,
    progressReporter,
    emitPlayer(event: PlayerEvent) {
      listener?.(event)
    },
    async withStore<T>(operation: (store: ReturnType<typeof usePlayerStore>) => Promise<T>) {
      return app.runWithContext(() => {
        const store = usePlayerStore()
        return operation(store)
      })
    },
  }
}

describe('usePlayerStore', () => {
  it('exposes play state and forwards pause seek resume stop', async () => {
    const harness = createPlayerStoreHarness()
    await harness.withStore(async (store) => {
      await store.play('profile-1', 'item-1')
      harness.emitPlayer({ type: 'started', positionSeconds: 0, durationSeconds: 120 })
      expect(store.state).toBe('playing')
      await store.pause()
      await store.seek(30)
      await store.resume()
      await store.stop()
      expect(harness.engine.pause).toHaveBeenCalled()
      expect(harness.engine.seek).toHaveBeenCalledWith(30)
      expect(harness.engine.resume).toHaveBeenCalled()
      expect(harness.engine.stop).toHaveBeenCalled()
    })
  })

  it('reports started on play and stopped on shutdown', async () => {
    const harness = createPlayerStoreHarness()
    await harness.withStore(async (store) => {
      await store.play('profile-1', 'item-1')
      await harness.progressReporter.whenIdle()
      expect(harness.reportPlayback).toHaveBeenCalledWith(
        'profile-1',
        expect.objectContaining({ type: 'started', itemId: 'item-1' }),
      )
      await store.shutdown()
      await harness.progressReporter.whenIdle()
      expect(harness.reportPlayback).toHaveBeenCalledWith(
        'profile-1',
        expect.objectContaining({ type: 'stopped' }),
      )
      expect(harness.engine.stop).toHaveBeenCalled()
    })
  })

  it('surfaces playback failures instead of staying on loading', async () => {
    const harness = createPlayerStoreHarness()
    harness.playback.play.mockRejectedValueOnce({
      code: 'PlayerUnavailable',
      message: 'mpv rejected loadfile',
    })
    await harness.withStore(async (store) => {
      await expect(store.play('profile-1', 'item-1')).rejects.toMatchObject({
        code: 'PlayerUnavailable',
      })
      expect(store.state).toBe('error')
      expect(store.lastError).toBe('mpv rejected loadfile')
    })
  })

  it('localizes legacy English mpv socket timeout for the user', async () => {
    const harness = createPlayerStoreHarness()
    harness.playback.play.mockRejectedValueOnce({
      code: 'PlayerUnavailable',
      message: 'mpv ipc socket did not appear',
    })
    await harness.withStore(async (store) => {
      await expect(store.play('profile-1', 'item-1')).rejects.toBeTruthy()
      expect(store.state).toBe('error')
      expect(store.lastError).not.toContain('pnpm')
      expect(store.lastError).not.toContain('fetch:mpv')
      expect(store.lastError).toMatch(/安装包|播放器|IPC/)
    })
  })
})
