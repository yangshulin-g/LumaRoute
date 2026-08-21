import { afterEach, describe, expect, it } from 'vitest'
import { ProgressReporter, type Clock, type Logger, type TimerHandle } from '@lumaroute/core'
import { createIntegrationApp } from './support/create-integration-app'
import { mockServer, type MockMediaServer } from './support/mock-media-server'

const servers: MockMediaServer[] = []

class ImmediateClock implements Clock {
  nowMs(): number {
    return 0
  }

  setTimeout(callback: () => void, delayMs: number): TimerHandle {
    void callback
    void delayMs
    return 0 as unknown as TimerHandle
  }

  clearTimeout(handle: TimerHandle): void {
    void handle
  }
}

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}

function playbackInfo(mediaSourceId: string, playSessionId: string) {
  return {
    PlaySessionId: playSessionId,
    MediaSources: [
      {
        Id: mediaSourceId,
        Container: 'mkv',
        SupportsDirectPlay: true,
        SupportsDirectStream: true,
        Bitrate: 8_000_000,
        RunTimeTicks: 1_200_000_000,
        MediaStreams: [
          { Type: 'Video', Codec: 'h264' },
          { Type: 'Audio', Codec: 'aac' },
        ],
      },
    ],
  }
}

async function failoverHarness() {
  const primary = await mockServer()
  const backup = await mockServer()
  servers.push(primary, backup)
  primary.reply('/Items/item-1/PlaybackInfo', {
    body: playbackInfo('source-primary', 'session-primary'),
  })
  backup.reply('/Items/item-1/PlaybackInfo', {
    body: playbackInfo('source-backup', 'session-backup'),
  })
  const app = await createIntegrationApp({
    lines: [primary.line('primary', 0), backup.line('backup', 1)],
  })
  return { ...app, primary, backup }
}

describe('playback startup failover', () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()))
  })

  it('regenerates, loads, and reports with the backup-line plan', async () => {
    const primary = await mockServer()
    const backup = await mockServer()
    servers.push(primary, backup)

    primary.reply('/Items/item-1/PlaybackInfo', {
      body: playbackInfo('source-primary', 'session-primary'),
    })
    backup.reply('/Items/item-1/PlaybackInfo', {
      body: playbackInfo('source-backup', 'session-backup'),
    })
    backup.reply('/Sessions/Playing', { status: 200, body: {} })
    const app = await createIntegrationApp({
      lines: [primary.line('primary', 0), backup.line('backup', 1)],
    })
    app.player.failNext({
      code: 'PlaybackFailed',
      message: 'network timeout before file-loaded',
    })

    const result = await app.playback.play('profile-1', 'item-1', 12)

    expect(app.player.plans.map((plan) => new URL(plan.streamUrl).origin)).toEqual([
      primary.baseUrl,
      backup.baseUrl,
    ])
    expect(result).toMatchObject({
      lineId: 'backup',
      plan: {
        mediaSourceId: 'source-backup',
        playSessionId: 'session-backup',
        startPositionSeconds: 12,
      },
    })

    const reporter = new ProgressReporter(new ImmediateClock(), silentLogger)
    reporter.start(result.plan, (report) => app.media.reportPlayback('profile-1', report))
    await reporter.handle({ type: 'started', positionSeconds: 12, durationSeconds: 120 })
    await reporter.whenIdle()
    await expect(backup.lastProgress()).resolves.toMatchObject({
      MediaSourceId: 'source-backup',
      PlaySessionId: 'session-backup',
      PositionTicks: 120_000_000,
    })
  })

  it.each([
    { code: 'AuthenticationExpired', message: 'HTTP 401' },
    { code: 'PlaybackFailed', message: 'HTTP 403 while loading' },
    { code: 'PlaybackFailed', message: 'HTTP 404 while loading' },
    { code: 'MediaNotDirectPlayable', message: 'transcode required' },
    { code: 'PlayerUnavailable', message: 'mpv missing' },
  ])('does not fail over for $code: $message', async (error) => {
    const app = await failoverHarness()
    app.player.failNext(error)
    await expect(app.playback.play('profile-1', 'item-1')).rejects.toMatchObject(error)
    expect(app.player.plans).toHaveLength(1)
    expect(app.backup.requests('/Items/item-1/PlaybackInfo')).toHaveLength(0)
  })
})
