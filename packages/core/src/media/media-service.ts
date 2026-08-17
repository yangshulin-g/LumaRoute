import { AppError } from '../errors/app-error'
import type { CredentialStore } from '../ports/credential-store'
import type { StoragePort } from '../ports/storage-port'
import type { RouteExecutor } from '../server/route-executor'
import type { ServerKind } from '../server/types'
import type { MediaServerAdapter } from './media-server-adapter'
import type { ItemQuery, RequestContext, SearchQuery } from './types'
import type { PlaybackReport } from '../playback/progress-reporter'

export class MediaService {
  constructor(
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
    private readonly routes: RouteExecutor,
    private readonly adapterFor: (kind: ServerKind) => MediaServerAdapter,
  ) {}

  getLibraries(profileId: string, signal?: AbortSignal) {
    return this.execute(profileId, (adapter, context) => adapter.getLibraries(context), signal)
  }

  getContinueWatching(profileId: string, signal?: AbortSignal) {
    return this.execute(
      profileId,
      (adapter, context) => adapter.getContinueWatching(context),
      signal,
    )
  }

  getItems(profileId: string, query: ItemQuery, signal?: AbortSignal) {
    return this.execute(profileId, (adapter, context) => adapter.getItems(query, context), signal)
  }

  search(profileId: string, query: SearchQuery, signal?: AbortSignal) {
    return this.execute(profileId, (adapter, context) => adapter.search(query, context), signal)
  }

  reportPlayback(
    profileId: string,
    event: PlaybackReport,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.execute(
      profileId,
      (adapter, context) => adapter.reportPlayback(event, context),
      signal,
    ).then(() => undefined)
  }

  private async execute<T>(
    profileId: string,
    call: (adapter: MediaServerAdapter, context: RequestContext) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<{ value: T; lineId: string }> {
    const profile = await this.storage.getServerProfile(profileId)
    if (!profile) throw new AppError('StorageFailure', 'Server profile was not found')
    const accessToken = await this.credentials.get(profile.credentialKey)
    if (!accessToken) throw new AppError('AuthenticationExpired', 'Server credential is unavailable')
    return this.routes.execute(
      profile,
      (line) =>
        call(this.adapterFor(profile.kind), {
          profileId,
          line,
          userId: profile.userId,
          accessToken,
          ...(signal ? { signal } : {}),
        }),
      signal,
    )
  }
}
