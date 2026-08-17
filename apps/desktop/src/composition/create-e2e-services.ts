import {
  EmbyAdapter,
  JellyfinAdapter,
  LineService,
  LoginService,
  MediaService,
  PlaybackService,
  ProgressReporter,
  RouteExecutor,
  ServerCatalog,
  createRedactingLogger,
  sensitiveOriginsFrom,
  DiagnosticService,
  type Clock,
  type RingBufferLogger,
  type ServerKind,
  type ServerProfile,
  type TimerHandle,
} from '@lumaroute/core'
import { queryClient } from '../queries/query-client'
import { DeviceIdentity } from '../platform/device/device-identity'
import { OriginPolicy } from '../platform/http/origin-policy'
import { BrowserHttpTransport } from '../platform/http/browser-http-transport'
import { SecureImageLoader } from '../platform/images/secure-image-loader'
import { FakePlayerEngine } from '../platform/player/fake-player-engine'
import { MemoryCredentialStore, MemoryStorage } from '../platform/storage/memory-storage'
import type { AppServices } from './service-types'

const systemClock: Clock = {
  nowMs: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as TimerHandle,
  clearTimeout: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
}

export type E2EControl = {
  player: FakePlayerEngine
  selectServer: (profileId: string) => Promise<void>
}

declare global {
  interface Window {
    __LUMAROUTE_E2E__?: E2EControl
  }
}

/**
 * Compile-time E2E composition: real Vue stores/core services with in-memory
 * storage/keyring, browser fetch HTTP, and FakePlayerEngine.
 * Selected only when `import.meta.env.VITE_E2E === '1'` — never via runtime query params.
 */
export async function createE2EServices(): Promise<AppServices> {
  const storage = new MemoryStorage()
  await storage.initialize()
  const credentials = new MemoryCredentialStore()
  const profileCache = { current: await storage.listServerProfiles() }
  const preferencesCache = { current: await storage.loadPreferences() }
  const refreshProfiles = async (): Promise<readonly ServerProfile[]> => {
    profileCache.current = await storage.listServerProfiles()
    return profileCache.current
  }
  const refreshPreferences = async () => {
    preferencesCache.current = await storage.loadPreferences()
    return preferencesCache.current
  }

  const redactingLogger: RingBufferLogger = createRedactingLogger(
    () => ({
      sensitiveOrigins: sensitiveOriginsFrom(
        profileCache.current,
        preferencesCache.current.sensitiveLineIds,
      ),
    }),
    (level, message, context) => {
      const method = console[level] ?? console.log
      method(message, context)
    },
  )

  const diagnostics = new DiagnosticService(
    () => redactingLogger.records(),
    () => ({
      sensitiveOrigins: sensitiveOriginsFrom(
        profileCache.current,
        preferencesCache.current.sensitiveLineIds,
      ),
    }),
    () => ({
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      appVersion: '0.1.0-e2e',
    }),
  )

  const originPolicy = new OriginPolicy(() =>
    profileCache.current.flatMap((profile) => profile.lines.map((line) => line.baseUrl)),
  )
  const http = new BrowserHttpTransport(originPolicy)
  const adapters = {
    emby: new EmbyAdapter(http),
    jellyfin: new JellyfinAdapter(http),
  } as const
  const login = new LoginService(
    (kind: ServerKind) => adapters[kind],
    storage,
    credentials,
    () => crypto.randomUUID(),
  )
  const catalog = new ServerCatalog(storage, credentials)
  const lines = new LineService(storage, credentials, {
    getServerIdentity: (kind, baseUrl, accessToken, signal) =>
      adapters[kind].getServerIdentity(baseUrl, accessToken, signal),
  })
  const routes = new RouteExecutor()
  const media = new MediaService(storage, credentials, routes, (kind) => adapters[kind])
  const images = new SecureImageLoader(storage, credentials, routes, http)
  const player = new FakePlayerEngine()
  const playback = new PlaybackService(
    storage,
    credentials,
    routes,
    (kind) => adapters[kind],
    player,
  )
  const progressReporter = new ProgressReporter(systemClock, redactingLogger)

  return {
    storage,
    credentials,
    http,
    originPolicy,
    deviceIdentity: new DeviceIdentity(storage),
    login,
    catalog,
    lines,
    routes,
    media,
    images,
    player,
    playback,
    progressReporter,
    logger: redactingLogger,
    diagnostics,
    queryClient,
    refreshProfiles,
    refreshPreferences,
  }
}

export function installE2EControl(services: AppServices, selectServer: (id: string) => Promise<void>): void {
  if (typeof window === 'undefined') return
  window.__LUMAROUTE_E2E__ = {
    player: services.player as FakePlayerEngine,
    selectServer,
  }
}
