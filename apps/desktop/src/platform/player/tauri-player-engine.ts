import type { UnlistenFn } from '@tauri-apps/api/event'
import type { PlaybackPlan, PlayerEngine, PlayerEvent, Unsubscribe } from '@lumaroute/player'

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
type ListenFn = <T>(
  event: string,
  handler: (event: { payload: T }) => void,
) => Promise<UnlistenFn>

export class TauriPlayerEngine implements PlayerEngine {
  constructor(
    private readonly invokeFn: InvokeFn,
    private readonly listenFn: ListenFn,
  ) {}

  play(plan: PlaybackPlan): Promise<void> {
    return this.invokeFn('player_play', { plan })
  }

  pause(): Promise<void> {
    return this.invokeFn('player_pause')
  }

  resume(): Promise<void> {
    return this.invokeFn('player_resume')
  }

  seek(positionSeconds: number): Promise<void> {
    return this.invokeFn('player_seek', { positionSeconds })
  }

  stop(): Promise<void> {
    return this.invokeFn('player_stop')
  }

  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe {
    let disposed = false
    let unlisten: UnlistenFn | null = null
    void this.listenFn<PlayerEvent>('player://event', ({ payload }) => {
      if (!disposed) listener(payload)
    }).then((fn) => {
      unlisten = fn
      if (disposed) fn()
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }
}
