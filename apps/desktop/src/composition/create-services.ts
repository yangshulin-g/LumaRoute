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
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { TauriCredentialStore } from '../platform/credentials/tauri-credential-store'
import { DeviceIdentity } from '../platform/device/device-identity'
import { OriginPolicy } from '../platform/http/origin-policy'
import { createTauriFetch } from '../platform/http/tauri-fetch'
import { TauriHttpTransport } from '../platform/http/tauri-http-transport'
import { SecureImageLoader } from '../platform/images/secure-image-loader'
import { TauriPlayerEngine } from '../platform/player/tauri-player-engine'
import { SqliteStorage } from '../platform/storage/sqlite-storage'
import { createTauriSqlClient } from '../platform/storage/tauri-sql-client'
import { queryClient } from '../queries/query-client'
import type { AppServices } from './service-types'

const systemClock: Clock = {
  nowMs: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as TimerHandle,
  clearTimeout: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
}

export async function createServices(): Promise<AppServices> {
  const sql = await createTauriSqlClient()
  const storage = new SqliteStorage(sql)
  await storage.initialize()

  const credentials = new TauriCredentialStore()
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
      appVersion: '0.1.0',
    }),
  )

  const originPolicy = new OriginPolicy(() =>
    profileCache.current.flatMap((profile) => profile.lines.map((line) => line.baseUrl)),
  )
  const http = new TauriHttpTransport(originPolicy, createTauriFetch() as unknown as typeof fetch)
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
  const player = new TauriPlayerEngine(invoke, listen)
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
