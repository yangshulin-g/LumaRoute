import { describe, expect, it } from 'vitest'
import { secondsToTicks, ticksToSeconds } from './ticks'

describe('playback time conversion', () => {
  it.each([
    [0, 0],
    [0.5, 5_000_000],
    [1, 10_000_000],
    [123.456789, 1_234_567_890],
  ])('converts %s seconds to %s ticks', (seconds, ticks) => {
    expect(secondsToTicks(seconds)).toBe(ticks)
    expect(ticksToSeconds(ticks)).toBeCloseTo(seconds, 7)
  })

  it('clamps negative and non-finite positions to zero', () => {
    expect(secondsToTicks(-1)).toBe(0)
    expect(secondsToTicks(Number.NaN)).toBe(0)
  })
})
