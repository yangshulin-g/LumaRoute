import type { PlayerEngine, PlaybackPlan } from '@lumaroute/player'
import { AppError } from '../errors/app-error'
import type { MediaPlaybackAdapter } from '../media/media-server-adapter'
import type { CredentialStore } from '../ports/credential-store'
import type { StoragePort } from '../ports/storage-port'
import type { RouteExecutor } from '../server/route-executor'
import type { ServerKind, ServerProfile } from '../server/types'

function httpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if ('status' in error && typeof error.status === 'number') return error.status
  if ('cause' in error) return httpStatus(error.cause)
  return undefined
}

export function isPreStartNetworkFailure(error: unknown): boolean {
  if (error instanceof AppError) {
    if (error.code === 'NetworkUnavailable' || error.code === 'LineTimeout') return true
    if (error.code === 'PlayerUnavailable') return false
    if (error.code === 'AuthenticationExpired') return false
    if (error.code === 'MediaNotDirectPlayable') return false
    if (error.code === 'PlaybackFailed') {
      const message = error.message.toLowerCase()
      if (/(codec|unsupported|format|decode)/.test(message)) return false
      return /(timeout|timed out|connection|dns|network|502|503|504)/.test(message)
    }
  }
  const status = httpStatus(error)
  return status === 502 || status === 503 || status === 504
}

async function requireProfile(storage: StoragePort, profileId: string): Promise<ServerProfile> {
  const profile = await storage.getServerProfile(profileId)
  if (!profile) throw new AppError('StorageFailure', 'Server profile was not found')
  return profile
}

async function requireCredential(credentials: CredentialStore, credentialKey: string): Promise<string> {
  const accessToken = await credentials.get(credentialKey)
  if (!accessToken) throw new AppError('AuthenticationExpired', 'Server credential is unavailable')
  return accessToken
}

export class PlaybackService {
  constructor(
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
    private readonly routes: RouteExecutor,
    private readonly adapterFor: (kind: ServerKind) => MediaPlaybackAdapter,
    private readonly player: PlayerEngine,
  ) {}

  async play(
    profileId: string,
    itemId: string,
    startPositionSeconds = 0,
  ): Promise<{ plan: PlaybackPlan; lineId: string }> {
    const profile = await requireProfile(this.storage, profileId)
    const accessToken = await requireCredential(this.credentials, profile.credentialKey)
    return this.routes
      .execute(profile, async (line) => {
        const receivedPlan = await this.adapterFor(profile.kind).getPlaybackPlan(itemId, {
          profileId,
          line,
          userId: profile.userId,
          accessToken,
        })
        const plan = { ...receivedPlan, startPositionSeconds }
        try {
          await this.player.play(plan)
          return { plan, lineId: line.id }
        } catch (error) {
          await this.player.stop().catch(() => undefined)
          if (isPreStartNetworkFailure(error)) {
            throw new AppError('NetworkUnavailable', 'Playback line failed', error)
          }
          throw error
        }
      })
      .then(({ value }) => value)
  }
}
