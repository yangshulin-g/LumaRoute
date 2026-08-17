import {
  JellyfinAdapter,
  LineService,
  MediaService,
  RouteExecutor,
  type ServerLine,
  type ServerProfile,
} from '@lumaroute/core'
import { MemoryCredentialStore, MemoryStorage, NodeHttpTransport } from './memory-ports'

export type IntegrationApp = {
  media: MediaService
  lines: LineService
  routes: RouteExecutor
  storage: MemoryStorage
  credentials: MemoryCredentialStore
}

const SERVER_ID = 'server-a'
const USER_ID = 'u'
const PROFILE_ID = 'profile-1'
const TOKEN = 'integration-token'

export async function createIntegrationApp(options: {
  lines: readonly ServerLine[]
  profile?: Partial<ServerProfile>
}): Promise<IntegrationApp> {
  const storage = new MemoryStorage()
  const credentials = new MemoryCredentialStore()
  await storage.initialize()

  const profile: ServerProfile = {
    id: PROFILE_ID,
    name: 'Integration',
    kind: 'jellyfin',
    serverId: SERVER_ID,
    userId: USER_ID,
    username: 'tester',
    credentialKey: `lumaroute/${PROFILE_ID}`,
    preferredLineId: options.lines[0]?.id ?? 'primary',
    ...options.profile,
    lines: [...options.lines],
  }

  await storage.saveServerProfile(profile)
  await credentials.set(profile.credentialKey, TOKEN)

  const http = new NodeHttpTransport()
  const adapter = new JellyfinAdapter(http)
  const routes = new RouteExecutor()
  const media = new MediaService(storage, credentials, routes, () => adapter)
  const lines = new LineService(storage, credentials, {
    getServerIdentity: (_kind, baseUrl, accessToken, signal) =>
      adapter.getServerIdentity(baseUrl, accessToken, signal),
  })

  return { media, lines, routes, storage, credentials }
}
