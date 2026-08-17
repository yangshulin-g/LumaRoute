import type { PlaybackPlan, PlayerEvent } from '@lumaroute/player'
import type { Clock, TimerHandle } from '../ports/clock'
import type { Logger } from '../ports/logger'
import { secondsToTicks } from './ticks'

export type PlaybackReportType =
  | 'started'
  | 'progress'
  | 'paused'
  | 'resumed'
  | 'seeked'
  | 'stopped'

export interface PlaybackReport {
  type: PlaybackReportType
  itemId: string
  mediaSourceId: string
  playSessionId: string
  positionTicks: number
  isPaused: boolean
}

const PROGRESS_INTERVAL_MS = 10_000
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const

function delay(clock: Clock, ms: number): Promise<void> {
  return new Promise((resolve) => {
    clock.setTimeout(resolve, ms)
  })
}

export class ProgressReporter {
  private plan: PlaybackPlan | null = null
  private send: ((report: PlaybackReport) => Promise<void>) | null = null
  private latest = { positionSeconds: 0, isPaused: false }
  private timer: TimerHandle | null = null
  private queue: Promise<void> = Promise.resolve()
  private stopped = false
  private startedReported = false
  private pendingProgress = false

  constructor(
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  start(plan: PlaybackPlan, send: (report: PlaybackReport) => Promise<void>): void {
    this.plan = plan
    this.send = send
    this.latest = { positionSeconds: plan.startPositionSeconds, isPaused: false }
    this.stopped = false
    this.startedReported = false
    this.pendingProgress = false
  }

  handle(event: PlayerEvent): Promise<void> {
    if (!this.plan || this.stopped || event.type === 'error') return Promise.resolve()
    this.latest.positionSeconds = event.positionSeconds
    if (event.type === 'paused') this.latest.isPaused = true
    if (event.type === 'resumed' || event.type === 'started') this.latest.isPaused = false
    if (event.type === 'started' && !this.startedReported) {
      this.startedReported = true
      this.enqueue('started')
      this.scheduleProgress()
    } else if (event.type === 'paused' || event.type === 'resumed' || event.type === 'seeked') {
      this.enqueue(event.type)
    } else if (event.type === 'ended' || event.type === 'stopped') {
      return this.flushAndStop(event.type === 'ended' ? 'ended' : 'user')
    }
    return Promise.resolve()
  }

  whenIdle(): Promise<void> {
    return this.queue
  }

  async flushAndStop(reason: 'ended' | 'user' | 'app-exit'): Promise<void> {
    void reason
    if (!this.plan || this.stopped) return
    this.stopped = true
    if (this.timer) this.clock.clearTimeout(this.timer)
    this.timer = null
    this.enqueue('stopped')
    await this.queue
  }

  private scheduleProgress(): void {
    this.timer = this.clock.setTimeout(() => {
      if (this.stopped) return
      this.enqueue('progress')
      this.scheduleProgress()
    }, PROGRESS_INTERVAL_MS)
  }

  private enqueue(type: PlaybackReportType): void {
    if (type === 'progress') {
      this.pendingProgress = true
      this.queue = this.queue.then(async () => {
        if (!this.pendingProgress || this.stopped) return
        this.pendingProgress = false
        await this.sendWithRetry(this.makeReport('progress'))
      })
      return
    }
    const report = this.makeReport(type)
    this.queue = this.queue.then(() => this.sendWithRetry(report))
  }

  private makeReport(type: PlaybackReportType): PlaybackReport {
    const plan = this.plan!
    return {
      type,
      itemId: plan.itemId,
      mediaSourceId: plan.mediaSourceId,
      playSessionId: plan.playSessionId,
      positionTicks: secondsToTicks(this.latest.positionSeconds),
      isPaused: this.latest.isPaused,
    }
  }

  private async sendWithRetry(report: PlaybackReport): Promise<void> {
    for (const delayMs of [0, ...RETRY_DELAYS_MS]) {
      if (delayMs) await delay(this.clock, delayMs)
      try {
        await this.send!(report)
        return
      } catch (error) {
        this.logger.warn('Playback report failed', { type: report.type, error })
      }
    }
  }
}
