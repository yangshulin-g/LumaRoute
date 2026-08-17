import { describe, expect, it, vi } from 'vitest'
import type { HttpRequest, HttpResponse, HttpTransport } from '../../ports/http-transport'
import librariesFixture from '../../../../../tests/fixtures/emby/libraries.json'
import itemsFixture from '../../../../../tests/fixtures/emby/items.json'
import playbackInfoFixture from '../../../../../tests/fixtures/emby/playback-info.json'
import { EmbyAdapter } from './emby-adapter'

const remuxFixture = {
  PlaySessionId: 'session-remux',
  MediaSources: [
    {
      Id: 'source-remux',
      Container: 'ts',
      SupportsDirectPlay: false,
      SupportsDirectStream: true,
      TranscodingUrl:
        '/videos/item-2/master.m3u8?MediaSourceId=source-remux&VideoCodec=copy&AudioCodec=copy&api_key=SECRET',
      Bitrate: 8_000_000,
      RunTimeTicks: 36_000_000_000,
      MediaStreams: [
        { Type: 'Video', Codec: 'h264' },
        { Type: 'Audio', Codec: 'aac' },
      ],
    },
  ],
}

const transcodeOnlyFixture = {
  PlaySessionId: 'session-transcode',
  MediaSources: [
    {
      Id: 'source-transcode',
      Container: 'mkv',
      SupportsDirectPlay: false,
      SupportsDirectStream: true,
      TranscodingUrl:
        '/videos/item-3/master.m3u8?MediaSourceId=source-transcode&VideoCodec=h264&AudioCodec=aac',
      Bitrate: 4_000_000,
      RunTimeTicks: 36_000_000_000,
      MediaStreams: [
        { Type: 'Video', Codec: 'hevc' },
        { Type: 'Audio', Codec: 'flac' },
      ],
    },
  ],
}

function createEnqueueTransport(): HttpTransport & {
  enqueue(...responses: unknown[]): void
  lastRequest(): HttpRequest | undefined
} {
  const queue: unknown[] = []
  const requests: HttpRequest[] = []
  const request = async <T>(req: HttpRequest): Promise<HttpResponse<T>> => {
    requests.push(req)
    const next = queue.shift()
    if (next === undefined) throw new Error('No queued transport response')
    return { status: 200, headers: {}, data: next as T }
  }
  return {
    request,
    enqueue(...responses: unknown[]) {
      queue.push(...responses)
    },
    lastRequest() {
      return requests.at(-1)
    },
  }
}

const context = {
  profileId: 'profile-1',
  line: {
    id: 'line-1',
    label: 'Primary',
    baseUrl: 'https://emby.example',
    priority: 0,
    enabled: true,
  },
  userId: 'user-a',
  accessToken: 'token-a',
}

describe('EmbyAdapter', () => {
  it('authenticates with device identity and maps the session', async () => {
    const transport = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: { Id: 'server-a', ServerName: 'Home' },
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: {
            AccessToken: 'token-a',
            ServerId: 'server-a',
            User: { Id: 'user-a', Name: 'alice' },
          },
        }),
    }
    const adapter = new EmbyAdapter(transport)

    await expect(
      adapter.authenticate({
        baseUrl: 'https://media.example.com',
        username: 'alice',
        password: 'secret',
        deviceId: 'device-a',
        deviceName: 'LumaRoute',
        appVersion: '0.1.0',
      }),
    ).resolves.toEqual({
      serverId: 'server-a',
      serverName: 'Home',
      userId: 'user-a',
      username: 'alice',
      accessToken: 'token-a',
    })
    expect(transport.request.mock.calls[1]?.[0].path).toBe('/Users/AuthenticateByName')
  })

  it('surfaces a public endpoint HTTP 403 before mapping its body', async () => {
    const transport = {
      request: vi.fn().mockResolvedValue({
        status: 403,
        headers: { 'content-type': 'text/html' },
        data: undefined,
      }),
    }
    const adapter = new EmbyAdapter(transport)

    await expect(
      adapter.authenticate({
        baseUrl: 'https://media.example.com',
        username: 'alice',
        password: 'secret',
        deviceId: 'device-a',
        deviceName: 'LumaRoute',
        appVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it.each([401, 403])('maps authentication HTTP %s to AuthenticationExpired', async (status) => {
    const transport = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: { Id: 'server-a', ServerName: 'Home' },
        })
        .mockResolvedValueOnce({ status, headers: {}, data: undefined }),
    }
    const adapter = new EmbyAdapter(transport)

    await expect(
      adapter.authenticate({
        baseUrl: 'https://media.example.com',
        username: 'alice',
        password: 'secret',
        deviceId: 'device-a',
        deviceName: 'LumaRoute',
        appVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({ code: 'AuthenticationExpired' })
  })

  it('reads authenticated server identity for line probing', async () => {
    const transport = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { Id: 'server-a', ServerName: 'Home' },
      }),
    }
    const adapter = new EmbyAdapter(transport)

    await expect(
      adapter.getServerIdentity('https://wan.example', 'token-a'),
    ).resolves.toEqual({ serverId: 'server-a', serverName: 'Home' })
    expect(transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://wan.example',
        path: '/System/Info',
        headers: expect.objectContaining({ 'X-Emby-Token': 'token-a' }),
      }),
    )
  })

  it('maps libraries, paged items, and resume position into domain models', async () => {
    const transport = createEnqueueTransport()
    transport.enqueue(librariesFixture, itemsFixture, itemsFixture)
    const adapter = new EmbyAdapter(transport)

    const libraries = await adapter.getLibraries(context)
    const page = await adapter.getItems(
      {
        libraryId: 'library-1',
        kinds: ['movie', 'series'],
        startIndex: 0,
        limit: 60,
      },
      context,
    )
    const resume = await adapter.getContinueWatching(context)

    expect(libraries).toEqual([
      { id: 'library-1', name: 'Movies', collectionType: 'movies' },
    ])
    expect(page).toMatchObject({
      total: 1,
      startIndex: 0,
      items: [
        {
          id: 'item-1',
          kind: 'movie',
          runtimeSeconds: 7200,
          playbackPositionSeconds: 120,
        },
      ],
    })
    expect(resume[0]?.playbackPositionSeconds).toBe(120)
  })

  it('searches only the selected user/server with bounded paging', async () => {
    const transport = createEnqueueTransport()
    transport.enqueue(itemsFixture)
    const adapter = new EmbyAdapter(transport)

    await adapter.search(
      {
        term: 'Arrival',
        kinds: ['movie', 'series'],
        startIndex: 0,
        limit: 40,
      },
      context,
    )
    expect(transport.lastRequest()).toMatchObject({
      baseUrl: context.line.baseUrl,
      path: `/Users/${context.userId}/Items`,
      query: {
        SearchTerm: 'Arrival',
        IncludeItemTypes: 'Movie,Series',
        StartIndex: 0,
        Limit: 40,
      },
    })
  })

  it('prefers direct play and keeps authentication in headers', async () => {
    const transport = createEnqueueTransport()
    transport.enqueue(playbackInfoFixture)
    const adapter = new EmbyAdapter(transport)
    const plan = await adapter.getPlaybackPlan('item-1', context)
    expect(plan).toMatchObject({
      itemId: 'item-1',
      mediaSourceId: 'source-direct',
      method: 'direct-play',
    })
    expect(plan.streamUrl).toBe(
      `${context.line.baseUrl}/Videos/item-1/stream.mkv?Static=true&MediaSourceId=source-direct`,
    )
    expect(plan.requestHeaders).toEqual({ 'X-Emby-Token': context.accessToken })
    expect(plan.streamUrl).not.toContain(context.accessToken)
  })

  it('accepts remux-only direct stream and rejects transcoding', async () => {
    const transport = createEnqueueTransport()
    const adapter = new EmbyAdapter(transport)
    transport.enqueue(remuxFixture)
    await expect(adapter.getPlaybackPlan('item-2', context)).resolves.toMatchObject({
      method: 'direct-stream',
    })
    transport.enqueue(transcodeOnlyFixture)
    await expect(adapter.getPlaybackPlan('item-3', context)).rejects.toMatchObject({
      code: 'MediaNotDirectPlayable',
    })
  })

  it.each([
    ['started', '/Sessions/Playing'],
    ['progress', '/Sessions/Playing/Progress'],
    ['paused', '/Sessions/Playing/Progress'],
    ['resumed', '/Sessions/Playing/Progress'],
    ['seeked', '/Sessions/Playing/Progress'],
    ['stopped', '/Sessions/Playing/Stopped'],
  ] as const)('maps %s to %s without credentials in payload', async (type, path) => {
    const transport = createEnqueueTransport()
    transport.enqueue({})
    const adapter = new EmbyAdapter(transport)
    await adapter.reportPlayback(
      {
        type,
        itemId: 'item-1',
        mediaSourceId: 'source-1',
        playSessionId: 'play-1',
        positionTicks: 100_000_000,
        isPaused: type === 'paused',
      },
      context,
    )
    expect(transport.lastRequest()).toMatchObject({
      path,
      method: 'POST',
      body: expect.objectContaining({
        ItemId: 'item-1',
        PositionTicks: 100_000_000,
      }),
    })
    expect(JSON.stringify(transport.lastRequest()?.body)).not.toContain(context.accessToken)
  })
})
