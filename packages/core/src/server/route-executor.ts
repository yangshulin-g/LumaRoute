import { AppError } from '../errors/app-error'
import { orderLines } from './line-order'
import type { ServerLine, ServerProfile } from './types'

function httpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if ('status' in error && typeof error.status === 'number') return error.status
  if ('cause' in error) return httpStatus(error.cause)
  return undefined
}

export function canFailOver(error: unknown): boolean {
  if (error instanceof AppError) {
    if (error.code === 'NetworkUnavailable' || error.code === 'LineTimeout') return true
  }
  const status = httpStatus(error)
  return status === 502 || status === 503 || status === 504
}

export class RouteExecutor {
  private readonly sticky = new Map<string, string>()

  async execute<T>(
    profile: ServerProfile,
    operation: (line: ServerLine) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<{ value: T; lineId: string }> {
    let lastError: unknown
    for (const line of orderLines(profile, this.sticky.get(profile.id) ?? null)) {
      signal?.throwIfAborted()
      try {
        const value = await operation(line)
        this.sticky.set(profile.id, line.id)
        return { value, lineId: line.id }
      } catch (error) {
        lastError = error
        if (!canFailOver(error)) throw error
      }
    }
    throw lastError ?? new AppError('NetworkUnavailable', 'No enabled server line is available')
  }

  markManualSelection(profileId: string, lineId: string): void {
    this.sticky.set(profileId, lineId)
  }

  currentLine(profileId: string): string | null {
    return this.sticky.get(profileId) ?? null
  }

  clearSession(profileId: string): void {
    this.sticky.delete(profileId)
  }
}
