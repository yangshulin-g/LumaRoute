import type { PlaybackPlan, PlayerEvent, Unsubscribe } from './types'

export interface PlayerEngine {
  play(plan: PlaybackPlan): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  seek(positionSeconds: number): Promise<void>
  stop(): Promise<void>
  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe
}
