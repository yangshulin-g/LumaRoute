import { AppError } from '../errors/app-error'
import type { CredentialStore } from '../ports/credential-store'
import type { StoragePort } from '../ports/storage-port'
import type { ServerKind, ServerProfile } from '../server/types'
import type { AuthenticationAdapter } from './authentication-adapter'

export interface AddServerInput {
  name: string
  kind: ServerKind
  baseUrl: string
  username: string
  password: string
  deviceId: string
  appVersion: string
}

export class LoginService {
  constructor(
    private readonly adapterFor: (kind: ServerKind) => AuthenticationAdapter,
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
    private readonly nextId: () => string,
  ) {}

  async addServer(
    input: AddServerInput,
  ): Promise<{ profile: ServerProfile; serverName: string }> {
    const profileId = this.nextId()
    const lineId = this.nextId()
    const session = await this.adapterFor(input.kind).authenticate({
      baseUrl: normalizeBaseUrl(input.baseUrl),
      username: input.username,
      password: input.password,
      deviceId: input.deviceId,
      deviceName: 'LumaRoute',
      appVersion: input.appVersion,
    })
    const credentialKey = `lumaroute/${profileId}`
    const profile: ServerProfile = {
      id: profileId,
      name: input.name,
      kind: input.kind,
      serverId: session.serverId,
      userId: session.userId,
      username: session.username,
      credentialKey,
      preferredLineId: lineId,
      lines: [
        {
          id: lineId,
          label: 'Primary',
          baseUrl: normalizeBaseUrl(input.baseUrl),
          priority: 0,
          enabled: true,
        },
      ],
    }
    await this.credentials.set(credentialKey, session.accessToken)
    try {
      await this.storage.saveServerProfile(profile)
      return { profile, serverName: session.serverName }
    } catch (cause) {
      await this.credentials.delete(credentialKey)
      throw new AppError('StorageFailure', 'Unable to persist authenticated server', cause)
    }
  }
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AppError(
      'NetworkUnavailable',
      'Server address must be an HTTP(S) URL without credentials',
    )
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}
