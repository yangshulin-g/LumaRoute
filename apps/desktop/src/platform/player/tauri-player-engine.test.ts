import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackPlan } from '@lumaroute/player'
import { TauriPlayerEngine } from './tauri-player-engine'

const invoke = vi.fn()
const nativeUnlisten = vi.fn()
let nativeHandler: ((event: { payload: unknown }) => void) | null = null
const listen = vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
  nativeHandler = handler
  return nativeUnlisten
})

const plan: PlaybackPlan = {
  itemId: 'item-1',
  mediaSourceId: 'source-1',
  playSessionId: 'session-1',
  streamUrl: 'https://media.example/stream.mkv',
  requestHeaders: { 'X-Emby-Token': 'secret-token' },
  container: 'mkv',
  videoCodec: 'h264',
  audioCodec: 'aac',
  bitrate: 8_000_000,
  durationSeconds: 120,
  method: 'direct-play',
  startPositionSeconds: 0,
}

describe('TauriPlayerEngine', () => {
  beforeEach(() => {
    invoke.mockReset()
    listen.mockClear()
    nativeUnlisten.mockReset()
    nativeHandler = null
  })

  it('uses allowlisted commands and unsubscribes from the native event channel', async () => {
    const engine = new TauriPlayerEngine(
      invoke as never,
      listen as never,
    )
    const listener = vi.fn()
    const unsubscribe = engine.subscribe(listener)
    await engine.play(plan)
    expect(invoke).toHaveBeenCalledWith('player_play', { plan })
    nativeHandler?.({
      payload: { type: 'started', positionSeconds: 0, durationSeconds: 120 },
    })
    expect(listener).toHaveBeenCalledWith({
      type: 'started',
      positionSeconds: 0,
      durationSeconds: 120,
    })
    unsubscribe()
    expect(nativeUnlisten).toHaveBeenCalled()
  })
})
