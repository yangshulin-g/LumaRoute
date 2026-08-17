import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors/app-error'
import type { ServerProfile } from '../server/types'
import { RouteExecutor } from '../server/route-executor'
import { MediaService } from './media-service'

class HttpFailure extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpFailure'
  }
}

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'jellyfin',
  serverId: 'server-a',
  userId: 'user-a',
  username: 'alice',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'line-primary',
  lines: [
    {
      id: 'line-primary',
      label: 'Primary',
      baseUrl: 'https://primary.example',
      priority: 0,
      enabled: true,
    },
    {
      id: 'line-backup',
      label: 'Backup',
      baseUrl: 'https://backup.example',
      priority: 1,
      enabled: true,
    },
  ],
}

describe('MediaService', () => {
  it('retries a browse request on the backup line and returns the active line', async () => {
    const adapter = {
      getLibraries: vi
        .fn()
        .mockRejectedValueOnce(new HttpFailure(503))
        .mockResolvedValueOnce([{ id: 'lib', name: 'Movies', collectionType: 'movies' }]),
      getItems: vi.fn(),
      getContinueWatching: vi.fn(),
      search: vi.fn(),
    }
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(profile),
    }
    const credentials = {
      get: vi.fn().mockResolvedValue('token-a'),
    }
    const service = new MediaService(
      storage as never,
      credentials as never,
      new RouteExecutor(),
      () => adapter as never,
    )

    const result = await service.getLibraries('profile-1')
    expect(result.lineId).toBe('line-backup')
    expect(adapter.getLibraries.mock.calls.map(([context]) => context.line.id)).toEqual([
      'line-primary',
      'line-backup',
    ])
  })

  it('raises AuthenticationExpired without trying a second line', async () => {
    const adapter = {
      getLibraries: vi.fn().mockRejectedValue(new AppError('AuthenticationExpired', 'expired')),
      getItems: vi.fn(),
      getContinueWatching: vi.fn(),
      search: vi.fn(),
    }
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(profile),
    }
    const credentials = {
      get: vi.fn().mockResolvedValue('token-a'),
    }
    const service = new MediaService(
      storage as never,
      credentials as never,
      new RouteExecutor(),
      () => adapter as never,
    )

    await expect(service.getLibraries('profile-1')).rejects.toMatchObject({
      code: 'AuthenticationExpired',
    })
    expect(adapter.getLibraries).toHaveBeenCalledTimes(1)
  })

  it('retries reportPlayback on backup line without overlapping attempts', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const reportPlayback = vi.fn().mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        if (reportPlayback.mock.calls.length === 1) {
          throw new HttpFailure(503)
        }
      } finally {
        inFlight -= 1
      }
    })
    const adapter = {
      getLibraries: vi.fn(),
      getItems: vi.fn(),
      getContinueWatching: vi.fn(),
      search: vi.fn(),
      getPlaybackPlan: vi.fn(),
      reportPlayback,
    }
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(profile),
    }
    const credentials = {
      get: vi.fn().mockResolvedValue('token-a'),
    }
    const service = new MediaService(
      storage as never,
      credentials as never,
      new RouteExecutor(),
      () => adapter as never,
    )

    await service.reportPlayback('profile-1', {
      type: 'progress',
      itemId: 'item-1',
      mediaSourceId: 'source-1',
      playSessionId: 'play-1',
      positionTicks: 10_000_000,
      isPaused: false,
    })

    expect(reportPlayback.mock.calls.map(([ , context]) => context.line.id)).toEqual([
      'line-primary',
      'line-backup',
    ])
    expect(maxInFlight).toBe(1)
  })
})
