import type { PlaybackPlan, PlayerEngine, PlayerEvent, Unsubscribe } from '@lumaroute/player'

/** Deterministic PlayerEngine used only by the compile-time E2E composition. */
export class FakePlayerEngine implements PlayerEngine {
  private listeners = new Set<(event: PlayerEvent) => void>()
  private plan: PlaybackPlan | null = null
  private positionSeconds = 0
  private durationSeconds = 0
  private paused = false

  async play(plan: PlaybackPlan): Promise<void> {
    this.plan = plan
    this.positionSeconds = plan.startPositionSeconds
    this.durationSeconds = plan.durationSeconds
    this.paused = false
    this.emit({
      type: 'started',
      positionSeconds: this.positionSeconds,
      durationSeconds: this.durationSeconds,
    })
  }

  async pause(): Promise<void> {
    this.paused = true
    this.emit({
      type: 'paused',
      positionSeconds: this.positionSeconds,
      durationSeconds: this.durationSeconds,
    })
  }

  async resume(): Promise<void> {
    this.paused = false
    this.emit({
      type: 'resumed',
      positionSeconds: this.positionSeconds,
      durationSeconds: this.durationSeconds,
    })
  }

  async seek(positionSeconds: number): Promise<void> {
    this.positionSeconds = positionSeconds
    this.emit({
      type: 'seeked',
      positionSeconds: this.positionSeconds,
      durationSeconds: this.durationSeconds,
    })
  }

  async stop(): Promise<void> {
    this.emit({
      type: 'stopped',
      positionSeconds: this.positionSeconds,
      durationSeconds: this.durationSeconds,
    })
    this.plan = null
  }

  /** E2E control: advance playback position and emit seeked (progress report path). */
  async advanceTo(positionSeconds: number): Promise<void> {
    await this.seek(positionSeconds)
  }

  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: PlayerEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
