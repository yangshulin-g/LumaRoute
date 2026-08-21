import {
  JellyfinAdapter,
  LineService,
  MediaService,
  PlaybackService,
  RouteExecutor,
  type ServerLine,
  type ServerProfile,
} from '@lumaroute/core'
import type { PlaybackPlan, PlayerEngine, PlayerEvent, Unsubscribe } from '@lumaroute/player'
import { MemoryCredentialStore, MemoryStorage, NodeHttpTransport } from './memory-ports'

export class RecordingPlayerEngine implements PlayerEngine {
  readonly plans: PlaybackPlan[] = []
  private nextError: unknown

  failNext(error: unknown): void {
    this.nextError = error
  }

  async play(plan: PlaybackPlan): Promise<void> {
    this.plans.push(structuredClone(plan))
    if (this.nextError !== undefined) {
      const error = this.nextError
      this.nextError = undefined
      throw error
    }
  }

  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async seek(positionSeconds: number): Promise<void> {
    void positionSeconds
  }
  async stop(): Promise<void> {}
  subscribe(listener: (event: PlayerEvent) => void): Unsubscribe {
    void listener
    return () => undefined
  }
}

export type IntegrationApp = {
  media: MediaService
  playback: PlaybackService
  player: RecordingPlayerEngine
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
  const player = new RecordingPlayerEngine()
  const playback = new PlaybackService(storage, credentials, routes, () => adapter, player)
  const lines = new LineService(storage, credentials, {
    getServerIdentity: (_kind, baseUrl, accessToken, signal) =>
      adapter.getServerIdentity(baseUrl, accessToken, signal),
  })

  return { media, playback, player, lines, routes, storage, credentials }
}
