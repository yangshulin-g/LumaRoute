import { describe, expect, it, vi } from 'vitest'
import { ServerCatalog } from './server-catalog'
import type { CredentialStore } from '../ports/credential-store'
import type { StoragePort } from '../ports/storage-port'
import type { ServerProfile } from './types'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'jellyfin',
  serverId: 'server-a',
  userId: 'user-a',
  username: 'alice',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'line-lan',
  lines: [
    { id: 'line-lan', label: 'LAN', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
  ],
}

function noopCredentials(): CredentialStore {
  return {
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  }
}

describe('ServerCatalog', () => {
  it('rejects a preferred line outside the profile', async () => {
    const storage = { saveServerProfile: vi.fn() } as unknown as StoragePort
    const catalog = new ServerCatalog(storage, noopCredentials())
    await expect(
      catalog.create({ ...profile, preferredLineId: 'missing' }),
    ).rejects.toMatchObject({ code: 'StorageFailure' })
    expect(storage.saveServerProfile).not.toHaveBeenCalled()
  })

  it('persists a valid profile', async () => {
    const storage = { saveServerProfile: vi.fn() } as unknown as StoragePort
    await new ServerCatalog(storage, noopCredentials()).create(profile)
    expect(storage.saveServerProfile).toHaveBeenCalledWith(profile)
  })

  it('deletes the credential before deleting the profile', async () => {
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(profile),
      deleteServerProfile: vi.fn().mockResolvedValue(undefined),
    }
    const credentials = {
      set: vi.fn(),
      get: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    }
    const catalog = new ServerCatalog(
      storage as unknown as StoragePort,
      credentials,
    )
    await catalog.remove(profile.id)
    expect(credentials.delete).toHaveBeenCalledWith(profile.credentialKey)
    expect(storage.deleteServerProfile).toHaveBeenCalledWith(profile.id)
    expect(credentials.delete.mock.invocationCallOrder[0]!).toBeLessThan(
      storage.deleteServerProfile.mock.invocationCallOrder[0]!,
    )
  })

  it('keeps one enabled preferred line after edits', async () => {
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(profile),
      saveServerProfile: vi.fn(),
    }
    const catalog = new ServerCatalog(
      storage as unknown as StoragePort,
      noopCredentials(),
    )
    const disabledLine = { ...profile.lines[0]!, enabled: false }
    await expect(
      catalog.updateLines(profile.id, [disabledLine], disabledLine.id),
    ).rejects.toMatchObject({ code: 'StorageFailure' })
  })
})
