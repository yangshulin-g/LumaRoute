export { healthCheck } from './system/health'
export type { AppHealth } from './system/health'

export { AppError } from './errors/app-error'
export type { AppErrorCode } from './errors/app-error'

export type { AppPreferences, ServerKind, ServerLine, ServerProfile } from './server/types'
export { ServerCatalog } from './server/server-catalog'
export { orderLines } from './server/line-order'
export { canFailOver, RouteExecutor } from './server/route-executor'
export { LineService } from './server/line-service'
export type { ServerIdentityProbe } from './server/line-service'

export type { StoragePort } from './ports/storage-port'
export type { CredentialStore } from './ports/credential-store'
export type { HttpRequest, HttpResponse, HttpTransport } from './ports/http-transport'
export type { Clock, TimerHandle } from './ports/clock'
export type { Logger } from './ports/logger'
export { redact } from './logging/redact'
export type { RedactionPolicy } from './logging/redact'
export {
  DiagnosticService,
  createDiagnosticService,
  sensitiveOriginsFrom,
  userActionFor,
} from './logging/diagnostic-service'
export type {
  DiagnosticEnvironment,
  DiagnosticLevel,
  DiagnosticRecord,
  DiagnosticUserAction,
  CreateDiagnosticServiceOptions,
} from './logging/diagnostic-service'
export { createRedactingLogger } from './logging/redacting-logger'
export type { RingBufferLogger } from './logging/redacting-logger'

export type { AuthSession, LoginInput } from './auth/types'
export type { AuthenticationAdapter } from './auth/authentication-adapter'
export { LoginService } from './auth/login-service'
export type { AddServerInput } from './auth/login-service'

export { EmbyAdapter } from './adapters/emby/emby-adapter'
export { JellyfinAdapter } from './adapters/jellyfin/jellyfin-adapter'

export type {
  ItemQuery,
  Library,
  MediaItem,
  MediaKind,
  Page,
  RequestContext,
  SearchQuery,
} from './media/types'
export type { MediaBrowseAdapter, MediaPlaybackAdapter, MediaServerAdapter } from './media/media-server-adapter'
export { MediaService } from './media/media-service'
export { PlaybackService, isPreStartNetworkFailure } from './playback/playback-service'
export { ProgressReporter } from './playback/progress-reporter'
export type { PlaybackReport, PlaybackReportType } from './playback/progress-reporter'
export { secondsToTicks, ticksToSeconds } from './playback/ticks'
