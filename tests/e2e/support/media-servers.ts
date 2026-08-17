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
}

export type MediaServerFixtures = {
  serverOne: LogicalServerFixture
  serverTwo: LogicalServerFixture
  lastProgress(): Promise<Record<string, unknown> | null>
  close(): Promise<void>
}

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures')

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
  },
): void {
  const itemsFixture = loadJson('jellyfin/items.json')
  const librariesFixture = loadJson('jellyfin/libraries.json')
  const playbackInfoFixture = loadJson('jellyfin/playback-info.json')

  server.reply('/System/Info/Public', {
    status: 200,
    body: { Id: options.serverId, ServerName: options.serverName },
  })
  server.reply('/System/Info', {
    status: 200,
    body: { Id: options.serverId, ServerName: options.serverName },
  })
  server.reply('/Users/AuthenticateByName', {
    status: 200,
    body: {
      AccessToken: options.token,
      ServerId: options.serverId,
      User: { Id: options.userId, Name: options.username },
    },
  })
  server.reply('/Library/VirtualFolders', { status: 200, body: librariesFixture })
  server.reply(`/Users/${options.userId}/Items`, { status: 200, body: itemsFixture })
  server.reply(`/Users/${options.userId}/Items/Resume`, {
    status: 200,
    body: { Items: [], TotalRecordCount: 0 },
  })
  server.reply('/Items/*/PlaybackInfo', { status: 200, body: playbackInfoFixture })
  server.reply('/Sessions/Playing', { status: 204, body: {} })
  server.reply('/Sessions/Playing/Progress', { status: 204, body: {} })
  server.reply('/Sessions/Playing/Stopped', { status: 204, body: {} })
}

async function createLogicalServer(input: {
  name: string
  serverId: string
  userId: string
  token: string
}): Promise<LogicalServerFixture> {
  const primary = await mockServer()
  const backup = await mockServer()
  const username = 'alice'
  installJellyfinSurface(primary, {
    serverId: input.serverId,
    serverName: input.name,
    userId: input.userId,
    token: input.token,
    username,
  })
  installJellyfinSurface(backup, {
    serverId: input.serverId,
    serverName: input.name,
    userId: input.userId,
    token: input.token,
    username,
  })
  return {
    name: input.name,
    serverId: input.serverId,
    username,
    password: 'test-password',
    primary,
    backup,
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
