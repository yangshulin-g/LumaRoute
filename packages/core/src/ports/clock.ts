export type TimerHandle = ReturnType<typeof setTimeout>

export interface Clock {
  nowMs(): number
  setTimeout(callback: () => void, delayMs: number): TimerHandle
  clearTimeout(handle: TimerHandle): void
}
