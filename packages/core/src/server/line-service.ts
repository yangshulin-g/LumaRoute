import { AppError } from '../errors/app-error'
import type { CredentialStore } from '../ports/credential-store'
import type { StoragePort } from '../ports/storage-port'
import type { ServerKind, ServerLine, ServerProfile } from './types'

export interface ServerIdentityProbe {
  getServerIdentity(
    kind: ServerKind,
    baseUrl: string,
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<{ serverId: string; serverName: string }>
}

export class LineService {
  constructor(
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
    private readonly probe: ServerIdentityProbe,
  ) {}

  async addLine(
    profileId: string,
    draft: ServerLine,
    signal?: AbortSignal,
  ): Promise<ServerProfile> {
    const profile = await this.storage.getServerProfile(profileId)
    if (!profile) throw new AppError('StorageFailure', 'Server profile was not found')
    const token = await this.credentials.get(profile.credentialKey)
    if (!token) throw new AppError('AuthenticationExpired', 'Server credential is unavailable')
    const identity = await this.probe.getServerIdentity(
      profile.kind,
      draft.baseUrl,
      token,
      signal,
    )
    if (identity.serverId !== profile.serverId) {
      throw new AppError('ServerMismatch', 'The line belongs to a different server')
    }
    const updated = { ...profile, lines: [...profile.lines, draft] }
    await this.storage.saveServerProfile(updated)
    return updated
  }
}
