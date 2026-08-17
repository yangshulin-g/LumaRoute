import { describe, expect, it, vi } from 'vitest'
import { DeviceIdentity } from './device-identity'
import type { AppPreferences, StoragePort } from '@lumaroute/core'

const defaultPreferences: AppPreferences = {
  deviceId: null,
  activeServerId: null,
  activeLibraryIdByServer: {},
  sensitiveLineIds: [],
}

describe('DeviceIdentity', () => {
  it('creates one UUID and reuses it across launches', async () => {
    const storage = {
      loadPreferences: vi
        .fn()
        .mockResolvedValueOnce({ ...defaultPreferences, deviceId: null })
        .mockResolvedValueOnce({ ...defaultPreferences, deviceId: 'device-stable' }),
      savePreferences: vi.fn().mockResolvedValue(undefined),
    } as unknown as StoragePort
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      'device-stable' as `${string}-${string}-${string}-${string}-${string}`,
    )
    const identity = new DeviceIdentity(storage)
    expect(await identity.getOrCreate()).toBe('device-stable')
    expect(await identity.getOrCreate()).toBe('device-stable')
    expect(storage.savePreferences).toHaveBeenCalledTimes(1)
  })
})
