import type { AppPreferences, ServerProfile } from '../server/types'

export interface StoragePort {
  initialize(): Promise<void>
  listServerProfiles(): Promise<readonly ServerProfile[]>
  getServerProfile(profileId: string): Promise<ServerProfile | null>
  saveServerProfile(profile: ServerProfile): Promise<void>
  deleteServerProfile(profileId: string): Promise<void>
  reorderServerProfiles(profileIds: readonly string[]): Promise<void>
  loadPreferences(): Promise<AppPreferences>
  savePreferences(preferences: AppPreferences): Promise<void>
}
