import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mockServer, type MockMediaServer } from '../../integration/support/mock-media-server'

export type LogicalServerFixture = {
  name: string
  serverId: string
  username: string
  password: string
  primary: MockMediaServer
  backup: MockMediaServer
  changePassword(password: string, token: string): void
}

export type MediaServerFixtures = {
  serverOne: LogicalServerFixture
  serverTwo: LogicalServerFixture
  lastProgress(): Promise<Record<string, unknown> | null>
  close(): Promise<void>
}

export const SERVER_TWO_ONLY_TITLE = 'Solaris'

const SERVER_TWO_ONLY_ITEM = {
  Id: 'item-server-two-only',
  Name: SERVER_TWO_ONLY_TITLE,
  Type: 'Movie',
  Overview: 'Only exists on Server Two.',
  ProductionYear: 1972,
  RunTimeTicks: 99000000000,
  ParentId: null,
  SeriesId: null,
  IndexNumber: null,
  ImageTags: {},
  UserData: { PlaybackPositionTicks: 0 },
}

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')

const POSTER_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
)

function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_ROOT, relativePath), 'utf8'))
}

function installJellyfinSurface(
  server: MockMediaServer,
  options: {
    serverId: string
    serverName: string
    userId: string
    token: string
    username: string
    password: string
    extraItems: readonly Record<string, unknown>[]
  },
): void {
  const baseItems = loadJson('jellyfin/items.json') as { Items: Record<string, unknown>[] }
  const allItems = [...baseItems.Items, ...options.extraItems]
  const itemsFixture = { Items: allItems, TotalRecordCount: allItems.length }
  const librariesFixture = loadJson('jellyfin/libraries.json')
  const playbackInfoFixture = loadJson('jellyfin/playback-info.json')
  const requiredToken = options.token

  server.reply('/System/Info/Public', {
    status: 200,
    body: { Id: options.serverId, ServerName: options.serverName },
  })
  server.reply('/System/Info', {
    status: 200,
    body: { Id: options.serverId, ServerName: options.serverName },
    requiredToken,
  })
  server.reply('/Users/AuthenticateByName', {
    status: 200,
    body: {
      AccessToken: options.token,
      ServerId: options.serverId,
      User: { Id: options.userId, Name: options.username },
    },
    requiredPassword: options.password,
  })
  server.reply('/Library/VirtualFolders', { status: 200, body: librariesFixture, requiredToken })
  server.reply(`/Users/${options.userId}/Items`, {
    status: 200,
    body: itemsFixture,
    filterBySearchTerm: true,
    requiredToken,
  })
  server.reply(`/Users/${options.userId}/Items/Resume`, {
    status: 200,
    body: { Items: [], TotalRecordCount: 0 },
    requiredToken,
  })
  server.reply('/Items/*/PlaybackInfo', { status: 200, body: playbackInfoFixture, requiredToken })
  server.reply('/Items/*/Images/Primary', {
    status: 200,
    bytes: POSTER_PNG,
    contentType: 'image/png',
    requiredToken,
  })
  server.reply('/Sessions/Playing', { status: 204, body: {}, requiredToken })
  server.reply('/Sessions/Playing/Progress', { status: 204, body: {}, requiredToken })
  server.reply('/Sessions/Playing/Stopped', { status: 204, body: {}, requiredToken })
}

async function createLogicalServer(input: {
  name: string
  serverId: string
  userId: string
  token: string
  extraItems?: readonly Record<string, unknown>[]
}): Promise<LogicalServerFixture> {
  const primary = await mockServer()
  const backup = await mockServer()
  const username = 'alice'
  const password = 'test-password'
  const install = (nextPassword: string, token: string): void => {
    for (const server of [primary, backup]) {
      installJellyfinSurface(server, {
        serverId: input.serverId,
        serverName: input.name,
        userId: input.userId,
        token,
        username,
        password: nextPassword,
        extraItems: input.extraItems ?? [],
      })
    }
  }
  install(password, input.token)
  return {
    name: input.name,
    serverId: input.serverId,
    username,
    password,
    primary,
    backup,
    changePassword: install,
  }
}

export async function startTwoMockMediaServers(): Promise<MediaServerFixtures> {
  const serverOne = await createLogicalServer({
    name: 'Server One',
    serverId: 'server-one',
    userId: 'user-a',
    token: 'token-one',
  })
  const serverTwo = await createLogicalServer({
    name: 'Server Two',
    serverId: 'server-two',
    userId: 'user-b',
    token: 'token-two',
    extraItems: [SERVER_TWO_ONLY_ITEM],
  })

  return {
    serverOne,
    serverTwo,
    lastProgress: () => serverOne.primary.lastProgress(),
    close: async () => {
      await Promise.all([
        serverOne.primary.close(),
        serverOne.backup.close(),
        serverTwo.primary.close(),
        serverTwo.backup.close(),
      ])
    },
  }
}
