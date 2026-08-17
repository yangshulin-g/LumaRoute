export type AppErrorCode =
  | 'NetworkUnavailable'
  | 'LineTimeout'
  | 'AuthenticationExpired'
  | 'ServerMismatch'
  | 'UnsupportedServerVersion'
  | 'MediaNotDirectPlayable'
  | 'PlayerUnavailable'
  | 'PlaybackFailed'
  | 'StorageFailure'

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}
