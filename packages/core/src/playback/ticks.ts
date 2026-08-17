const TICKS_PER_SECOND = 10_000_000

export function secondsToTicks(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.round(seconds * TICKS_PER_SECOND)
}

export function ticksToSeconds(ticks: number): number {
  if (!Number.isFinite(ticks) || ticks <= 0) return 0
  return ticks / TICKS_PER_SECOND
}
