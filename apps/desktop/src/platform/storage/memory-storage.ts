import type { AppPreferences, CredentialStore, ServerProfile, StoragePort } from '@lumaroute/core'

const DEFAULT_PREFERENCES: AppPreferences = {
  deviceId: null,
  activeServerId: null,
  activeLibraryIdByServer: {},
  sensitiveLineIds: [],
}

const STORAGE_KEY = 'lumaroute.e2e.storage'
const CREDENTIAL_KEY = 'lumaroute.e2e.credentials'

type PersistedStorage = {
  profiles: ServerProfile[]
  order: string[]
  preferences: AppPreferences
}

function readStorage(): PersistedStorage {
  if (typeof sessionStorage === 'undefined') {
    return {
      profiles: [],
      order: [],
      preferences: { ...DEFAULT_PREFERENCES, activeLibraryIdByServer: {} },
    }
  }
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return {
      profiles: [],
      order: [],
      preferences: { ...DEFAULT_PREFERENCES, activeLibraryIdByServer: {} },
    }
  }
  return JSON.parse(raw) as PersistedStorage
}

function writeStorage(value: PersistedStorage): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

/** In-memory StoragePort for compile-time E2E composition (persisted across soft reloads). */
export class MemoryStorage implements StoragePort {
  async initialize(): Promise<void> {}

  async listServerProfiles(): Promise<readonly ServerProfile[]> {
    const state = readStorage()
    return state.order
      .map((id) => state.profiles.find((profile) => profile.id === id))
      .filter((profile): profile is ServerProfile => profile !== undefined)
      .map((profile) => structuredClone(profile))
  }

  async getServerProfile(profileId: string): Promise<ServerProfile | null> {
    const profile = readStorage().profiles.find((entry) => entry.id === profileId)
    return profile ? structuredClone(profile) : null
  }

  async saveServerProfile(profile: ServerProfile): Promise<void> {
    const state = readStorage()
    const index = state.profiles.findIndex((entry) => entry.id === profile.id)
    if (index >= 0) state.profiles[index] = structuredClone(profile)
    else {
      state.profiles.push(structuredClone(profile))
      state.order.push(profile.id)
    }
    writeStorage(state)
  }

  async deleteServerProfile(profileId: string): Promise<void> {
    const state = readStorage()
    state.profiles = state.profiles.filter((profile) => profile.id !== profileId)
    state.order = state.order.filter((id) => id !== profileId)
    writeStorage(state)
  }

  async reorderServerProfiles(profileIds: readonly string[]): Promise<void> {
    const state = readStorage()
    state.order = [...profileIds]
    writeStorage(state)
  }

  async loadPreferences(): Promise<AppPreferences> {
    const preferences = readStorage().preferences
    return {
      ...preferences,
      activeLibraryIdByServer: { ...preferences.activeLibraryIdByServer },
      sensitiveLineIds: [...preferences.sensitiveLineIds],
    }
  }

  async savePreferences(preferences: AppPreferences): Promise<void> {
    const state = readStorage()
    state.preferences = {
      ...preferences,
      activeLibraryIdByServer: { ...preferences.activeLibraryIdByServer },
      sensitiveLineIds: [...preferences.sensitiveLineIds],
    }
    writeStorage(state)
  }
}

/** In-memory CredentialStore for compile-time E2E composition. */
export class MemoryCredentialStore implements CredentialStore {
  async set(credentialKey: string, token: string): Promise<void> {
    const values = readCredentials()
    values[credentialKey] = token
    writeCredentials(values)
  }

  async get(credentialKey: string): Promise<string | null> {
    return readCredentials()[credentialKey] ?? null
  }

  async delete(credentialKey: string): Promise<void> {
    const values = readCredentials()
    delete values[credentialKey]
    writeCredentials(values)
  }
}

function readCredentials(): Record<string, string> {
  if (typeof sessionStorage === 'undefined') return {}
  const raw = sessionStorage.getItem(CREDENTIAL_KEY)
  return raw ? (JSON.parse(raw) as Record<string, string>) : {}
}

function writeCredentials(values: Record<string, string>): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(CREDENTIAL_KEY, JSON.stringify(values))
}
