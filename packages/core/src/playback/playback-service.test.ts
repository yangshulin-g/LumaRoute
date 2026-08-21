import { describe, expect, it, vi } from 'vitest'
import type { PlaybackPlan } from '@lumaroute/player'
import { AppError } from '../errors/app-error'
import type { ServerLine, ServerProfile } from '../server/types'
import { RouteExecutor } from '../server/route-executor'
import { PlaybackService, isPreStartNetworkFailure } from './playback-service'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'emby',
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

function planFor(line: ServerLine): PlaybackPlan {
  return {
    itemId: 'item-1',
    mediaSourceId: 'source-1',
    playSessionId: `session-${line.id}`,
    streamUrl: `${line.baseUrl}/Videos/item-1/stream.mkv?Static=true&MediaSourceId=source-1`,
    requestHeaders: { 'X-Emby-Token': 'token-a' },
    container: 'mkv',
    videoCodec: 'h264',
    audioCodec: 'aac',
    bitrate: 8_000_000,
    durationSeconds: 120,
    method: 'direct-play',
    startPositionSeconds: 0,
  }
}

describe('PlaybackService', () => {
  it.each([
    [{ code: 'PlaybackFailed', message: 'connection timed out before file-loaded' }, true],
    [{ code: 'PlaybackFailed', message: 'HTTP 503 while loading' }, true],
    [{ code: 'PlaybackFailed', message: 'HTTP 401 while loading' }, false],
    [{ code: 'PlaybackFailed', message: 'HTTP 403 while loading' }, false],
    [{ code: 'PlaybackFailed', message: 'HTTP 404 while loading' }, false],
    [{ code: 'PlaybackFailed', message: 'unsupported codec' }, false],
    [{ code: 'PlayerUnavailable', message: 'packaged mpv sidecar missing' }, false],
    [{ code: 'MediaNotDirectPlayable', message: 'transcode required' }, false],
  ])('classifies pre-start native rejection %j as %s', (error, retryable) => {
    expect(isPreStartNetworkFailure(error)).toBe(retryable)
  })

  it('regenerates the plan on the backup line when mpv cannot load the primary', async () => {
    const adapter = {
      getPlaybackPlan: vi.fn(async (_itemId: string, context: { line: ServerLine }) =>
        planFor(context.line),
      ),
    }
    const player = {
      play: vi
        .fn()
        .mockRejectedValueOnce(new AppError('PlaybackFailed', 'network load failed'))
        .mockResolvedValueOnce(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      resume: vi.fn(),
      seek: vi.fn(),
      subscribe: vi.fn(),
    }
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(profile),
    }
    const credentials = {
      get: vi.fn().mockResolvedValue('token-a'),
    }
    const service = new PlaybackService(
      storage as never,
      credentials as never,
      new RouteExecutor(),
      () => adapter,
      player,
    )

    const result = await service.play('profile-1', 'item-1')
    expect(adapter.getPlaybackPlan.mock.calls.map(([, context]) => context.line.id)).toEqual([
      'line-primary',
      'line-backup',
    ])
    expect(player.stop).toHaveBeenCalledTimes(1)
    expect(result.lineId).toBe('line-backup')
  })

  it('does not try another line for MediaNotDirectPlayable', async () => {
    const adapter = {
      getPlaybackPlan: vi
        .fn()
        .mockRejectedValue(new AppError('MediaNotDirectPlayable', 'transcode required')),
    }
    const player = {
      play: vi.fn(),
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      seek: vi.fn(),
      subscribe: vi.fn(),
    }
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(profile),
    }
    const credentials = {
      get: vi.fn().mockResolvedValue('token-a'),
    }
    const service = new PlaybackService(
      storage as never,
      credentials as never,
      new RouteExecutor(),
      () => adapter,
      player,
    )

    await expect(service.play('profile-1', 'item-1')).rejects.toMatchObject({
      code: 'MediaNotDirectPlayable',
    })
    expect(adapter.getPlaybackPlan).toHaveBeenCalledTimes(1)
    expect(player.play).not.toHaveBeenCalled()
  })
})
