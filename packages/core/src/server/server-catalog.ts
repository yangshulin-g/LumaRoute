import { AppError } from '../errors/app-error'
import type { CredentialStore } from '../ports/credential-store'
import type { StoragePort } from '../ports/storage-port'
import type { ServerLine, ServerProfile } from './types'

export class ServerCatalog {
  constructor(
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
  ) {}

  async create(profile: ServerProfile): Promise<void> {
    this.assertValid(profile)
    await this.storage.saveServerProfile(profile)
  }

  async update(profile: ServerProfile): Promise<void> {
    this.assertValid(profile)
    await this.storage.saveServerProfile(profile)
  }

  async rename(profileId: string, name: string): Promise<ServerProfile> {
    const profile = await this.requireProfile(profileId)
    const updated = { ...profile, name: name.trim() }
    this.assertValid(updated)
    await this.storage.saveServerProfile(updated)
    return updated
  }

  async updateLines(
    profileId: string,
    lines: ServerLine[],
    preferredLineId: string,
  ): Promise<ServerProfile> {
    const profile = await this.requireProfile(profileId)
    const updated = { ...profile, lines, preferredLineId }
    this.assertValid(updated)
    if (!lines.some((line) => line.id === preferredLineId && line.enabled)) {
      throw new AppError('StorageFailure', 'The preferred line must remain enabled')
    }
    await this.storage.saveServerProfile(updated)
    return updated
  }

  async remove(profileId: string): Promise<void> {
    const profile = await this.requireProfile(profileId)
    await this.credentials.delete(profile.credentialKey)
    await this.storage.deleteServerProfile(profileId)
  }

  reorder(profileIds: readonly string[]): Promise<void> {
    return this.storage.reorderServerProfiles(profileIds)
  }

  private async requireProfile(profileId: string): Promise<ServerProfile> {
    const profile = await this.storage.getServerProfile(profileId)
    if (!profile) throw new AppError('StorageFailure', 'Server profile was not found')
    return profile
  }

  private assertValid(profile: ServerProfile): void {
    const ids = new Set(profile.lines.map((line) => line.id))
    if (ids.size !== profile.lines.length || !ids.has(profile.preferredLineId)) {
      throw new AppError('StorageFailure', 'Server profile contains invalid line references')
    }
    for (const line of profile.lines) {
      const url = new URL(line.baseUrl)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new AppError('StorageFailure', 'Server line must be an HTTP(S) origin without credentials')
      }
    }
  }
}
