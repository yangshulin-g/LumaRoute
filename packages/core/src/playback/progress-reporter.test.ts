import { describe, expect, it } from 'vitest'
import type { PlaybackPlan } from '@lumaroute/player'
import type { Clock, TimerHandle } from '../ports/clock'
import type { Logger } from '../ports/logger'
import type { PlaybackReport } from './progress-reporter'
import { ProgressReporter } from './progress-reporter'

const plan: PlaybackPlan = {
  itemId: 'item-1',
  mediaSourceId: 'source-1',
  playSessionId: 'play-1',
  streamUrl: 'https://example/stream',
  requestHeaders: {},
  container: 'mkv',
  videoCodec: 'h264',
  audioCodec: 'aac',
  bitrate: 8_000_000,
  durationSeconds: 120,
  method: 'direct-play',
  startPositionSeconds: 0,
}

class FakeClock implements Clock {
  private now = 0
  private nextId = 1
  private timers = new Map<number, { due: number; callback: () => void }>()

  nowMs(): number {
    return this.now
  }

  setTimeout(callback: () => void, delayMs: number): TimerHandle {
    const id = this.nextId++
    this.timers.set(id, { due: this.now + delayMs, callback })
    return id as unknown as TimerHandle
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers.delete(handle as unknown as number)
  }

  async advanceBy(ms: number): Promise<void> {
    const target = this.now + ms
    for (;;) {
      for (let i = 0; i < 10; i++) await Promise.resolve()
      let next: { id: number; due: number; callback: () => void } | null = null
      for (const [id, timer] of this.timers) {
        if (
          timer.due <= target &&
          (!next || timer.due < next.due || (timer.due === next.due && id < next.id))
        ) {
          next = { id, due: timer.due, callback: timer.callback }
        }
      }
      if (!next) break
      this.now = next.due
      this.timers.delete(next.id)
      next.callback()
    }
    this.now = target
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }

  async runAll(): Promise<void> {
    // Flush currently due work without chasing newly scheduled recurring timers forever.
    const snapshot = [...this.timers.entries()]
    let latestDue = this.now
    for (const [, timer] of snapshot) {
      latestDue = Math.max(latestDue, timer.due)
    }
    if (latestDue > this.now) await this.advanceBy(latestDue - this.now)
  }
}

function createReporterHarness(options: { failures?: number; blocked?: boolean } = {}) {
  const clock = new FakeClock()
  const logger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
  }
  const reports: PlaybackReport[] = []
  const attemptTimes: number[] = []
  let inFlight = 0
  let maxInFlight = 0
  let remainingFailures = options.failures ?? 0
  let blockedResolve: (() => void) | null = null
  let blockedPromise: Promise<void> | null = options.blocked
    ? new Promise<void>((resolve) => {
        blockedResolve = resolve
      })
    : null

  const send = async (report: PlaybackReport): Promise<void> => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    attemptTimes.push(clock.nowMs())
    try {
      if (blockedPromise) await blockedPromise
      if (remainingFailures > 0) {
        remainingFailures -= 1
        throw new Error('report failed')
      }
      reports.push(report)
    } finally {
      inFlight -= 1
    }
  }

  return {
    clock,
    reporter: new ProgressReporter(clock, logger),
    send,
    release() {
      blockedResolve?.()
      blockedPromise = null
    },
    types() {
      return reports.map((report) => report.type)
    },
    progressPositions() {
      return reports.filter((report) => report.type === 'progress').map((report) => report.positionTicks)
    },
    attemptTimes() {
      return attemptTimes
    },
    maxInFlight() {
      return maxInFlight
    },
  }
}

describe('ProgressReporter', () => {
  it('reports started, ten-second progress, pause, seek, and stopped serially', async () => {
    const harness = createReporterHarness()
    harness.reporter.start(plan, harness.send)
    await harness.reporter.handle({ type: 'started', positionSeconds: 0, durationSeconds: 120 })
    await harness.reporter.whenIdle()
    await harness.clock.advanceBy(9_999)
    expect(harness.types()).toEqual(['started'])
    await harness.clock.advanceBy(1)
    await harness.reporter.whenIdle()
    expect(harness.types()).toEqual(['started', 'progress'])
    await harness.reporter.handle({ type: 'paused', positionSeconds: 12, durationSeconds: 120 })
    await harness.reporter.handle({ type: 'seeked', positionSeconds: 50, durationSeconds: 120 })
    await harness.reporter.flushAndStop('user')
    expect(harness.types()).toEqual(['started', 'progress', 'paused', 'seeked', 'stopped'])
    expect(harness.maxInFlight()).toBe(1)
  })

  it('retries at one, two, and four seconds without rejecting playback', async () => {
    const harness = createReporterHarness({ failures: 3 })
    harness.reporter.start(plan, harness.send)
    await harness.reporter.handle({
      type: 'started',
      positionSeconds: 0,
      durationSeconds: 120,
    })
    await harness.clock.advanceBy(7_000)
    await harness.reporter.whenIdle()
    expect(harness.attemptTimes()).toEqual([0, 1_000, 3_000, 7_000])
  })

  it('coalesces pending periodic progress to the newest position', async () => {
    const harness = createReporterHarness({ blocked: true })
    harness.reporter.start(plan, harness.send)
    await harness.reporter.handle({ type: 'started', positionSeconds: 0, durationSeconds: 120 })
    await harness.clock.advanceBy(10_000)
    await harness.reporter.handle({ type: 'position', positionSeconds: 10, durationSeconds: 120 })
    await harness.reporter.handle({ type: 'position', positionSeconds: 20, durationSeconds: 120 })
    harness.release()
    await harness.reporter.whenIdle()
    expect(harness.progressPositions().at(-1)).toBe(20 * 10_000_000)
  })
})
