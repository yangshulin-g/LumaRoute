import type {
  AddServerInput,
  AppPreferences,
  CredentialStore,
  DiagnosticService,
  HttpTransport,
  LineService,
  LoginService,
  MediaService,
  PlaybackService,
  ProgressReporter,
  RingBufferLogger,
  RouteExecutor,
  ServerCatalog,
  ServerProfile,
  StoragePort,
} from '@lumaroute/core'
import type { PlayerEngine } from '@lumaroute/player'
import type { QueryClient } from '@tanstack/vue-query'
import type { DeviceIdentity } from '../platform/device/device-identity'
import type { OriginPolicy } from '../platform/http/origin-policy'
import type { SecureImageLoader } from '../platform/images/secure-image-loader'

export interface QueryClientPort {
  cancelQueries(filters: {
    predicate: (query: { queryKey: readonly unknown[] }) => boolean
  }): Promise<void>
}

export interface AppServices {
  storage: StoragePort
  credentials: CredentialStore
  http: HttpTransport
  originPolicy: OriginPolicy
  deviceIdentity: DeviceIdentity
  login: LoginService
  catalog: ServerCatalog
  lines: LineService
  routes: RouteExecutor
  media: MediaService
  images: SecureImageLoader
  player: PlayerEngine
  playback: PlaybackService
  progressReporter: ProgressReporter
  logger: RingBufferLogger
  diagnostics: DiagnosticService
  queryClient: QueryClient & QueryClientPort
  refreshProfiles: () => Promise<readonly ServerProfile[]>
  refreshPreferences: () => Promise<AppPreferences>
}

export type OnboardingInput = Omit<AddServerInput, 'deviceId' | 'appVersion'>
