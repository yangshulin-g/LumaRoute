import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import { AppError } from '@lumaroute/core'
import { useServerStore } from './server-store'
import { useMediaStore } from './media-store'
import { provideServices, resetProvidedServices } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'

const selectServer = vi.fn().mockResolvedValue(undefined)
const activeServerId = { value: 'profile-2' as string | null }

vi.mock('./app-store', () => ({
  useAppStore: () => ({
    get activeServerId() {
      return activeServerId.value
    },
    selectServer,
  }),
}))

function withServices<T>(
  services: AppServices,
  operation: (store: ReturnType<typeof useServerStore>) => Promise<T>,
): Promise<T> {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  setActivePinia(pinia)
  provideServices(app, services)
  return app.runWithContext(() => {
    const store = useServerStore()
    return operation(store)
  })
}

describe('useServerStore', () => {
  const loginAddServer = vi.fn()
  const withEphemeralOrigin = vi.fn(async (_url: string, operation: () => Promise<unknown>) =>
    operation(),
  )
  const getOrCreate = vi.fn().mockResolvedValue('device-1')
  const refreshProfiles = vi.fn().mockResolvedValue([])

  afterEach(() => {
    resetProvidedServices()
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    loginAddServer.mockReset()
    withEphemeralOrigin.mockClear()
    getOrCreate.mockClear()
    refreshProfiles.mockReset().mockResolvedValue([])
    selectServer.mockReset().mockResolvedValue(undefined)
    activeServerId.value = 'profile-2'
  })

  it('adds a server through ephemeral origin and stores onboarding result', async () => {
    loginAddServer.mockResolvedValue({
      serverName: 'Living Room',
      profile: { id: 'profile-1', serverId: 'server-a' },
    })
    refreshProfiles.mockResolvedValue([{ id: 'profile-1' }])

    const services = {
      deviceIdentity: { getOrCreate },
      originPolicy: { withEphemeralOrigin },
      login: { addServer: loginAddServer },
      refreshProfiles,
    } as unknown as AppServices

    const result = await withServices(services, (store) =>
      store.addServer({
        name: 'Home',
        kind: 'jellyfin',
        baseUrl: 'https://media.example.com',
        username: 'alice',
        password: 'secret',
      }),
    )

    expect(withEphemeralOrigin).toHaveBeenCalledWith(
      'https://media.example.com',
      expect.any(Function),
    )
    expect(loginAddServer).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'jellyfin',
        deviceId: 'device-1',
        appVersion: '0.1.0',
      }),
    )
    expect(result).toEqual({
      serverName: 'Living Room',
      serverId: 'server-a',
      id: 'profile-1',
    })

    const store = useServerStore()
    expect(store.onboardingResult).toEqual({
      serverName: 'Living Room',
      serverId: 'server-a',
    })
    expect(store.profiles).toEqual([{ id: 'profile-1' }])
    expect(selectServer).toHaveBeenCalledWith('profile-1')
  })

  it('reorders servers and removes active server through the catalog', async () => {
    const reorder = vi.fn().mockResolvedValue(undefined)
    const remove = vi.fn().mockResolvedValue(undefined)
    const profiles = [
      { id: 'profile-1', name: 'Home' },
      { id: 'profile-2', name: 'Office' },
    ]
    const services = {
      catalog: { reorder, remove },
    } as unknown as AppServices

    await withServices(services, async (store) => {
      store.profiles = profiles as never
      await store.reorderServers(['profile-2', 'profile-1'])
      expect(reorder).toHaveBeenCalledWith(['profile-2', 'profile-1'])
      expect(store.profiles.map((profile) => profile.id)).toEqual(['profile-2', 'profile-1'])
    })

    await withServices(services, async (store) => {
      store.profiles = [
        { id: 'profile-2', name: 'Office' },
        { id: 'profile-1', name: 'Home' },
      ] as never
      await store.deleteServer('profile-2')
      expect(remove).toHaveBeenCalledWith('profile-2')
      expect(store.profiles.map((profile) => profile.id)).toEqual(['profile-1'])
      expect(selectServer).toHaveBeenCalledWith('profile-1')
    })
  })

  it('leaves no active server after the last server is deleted', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const services = { catalog: { remove } } as unknown as AppServices
    await withServices(services, async (store) => {
      store.profiles = [{ id: 'profile-2', name: 'Office' }] as never
      await store.deleteServer('profile-2')
      expect(store.profiles).toEqual([])
      expect(selectServer).toHaveBeenCalledWith(null)
    })
  })

  it('re-authenticates with the device identity and reloads the active server home', async () => {
    const reauthenticate = vi.fn().mockResolvedValue({ id: 'profile-2' })
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const media = {
      getLibraries: vi.fn().mockResolvedValue({ value: [], lineId: 'line-1' }),
      getContinueWatching: vi.fn().mockResolvedValue({ value: [], lineId: 'line-1' }),
    }
    const services = {
      deviceIdentity: { getOrCreate },
      login: { reauthenticate },
      media,
      queryClient: { invalidateQueries },
    } as unknown as AppServices

    await withServices(services, async (store) => {
      await store.reauthenticate('profile-2', 'new-password')
      expect(reauthenticate).toHaveBeenCalledWith({
        profileId: 'profile-2',
        password: 'new-password',
        deviceId: 'device-1',
        appVersion: '0.1.0',
      })
      expect(media.getLibraries).toHaveBeenCalledWith('profile-2', expect.any(AbortSignal))
      expect(useMediaStore().connectionStatus('profile-2')).toBe('healthy')
      expect(invalidateQueries).toHaveBeenCalledWith({
        predicate: expect.any(Function),
      })
      const predicate = invalidateQueries.mock.calls[0]![0]!.predicate as (query: {
        queryKey: readonly unknown[]
      }) => boolean
      expect(predicate({ queryKey: ['media', 'profile-2'] })).toBe(true)
      expect(predicate({ queryKey: ['media', 'profile-1'] })).toBe(false)
    })
  })

  it('clears the stale error of a non-active server without loading its home', async () => {
    activeServerId.value = 'profile-1'
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    const media = {
      getLibraries: vi
        .fn()
        .mockRejectedValueOnce(new AppError('AuthenticationExpired', 'rejected')),
      getContinueWatching: vi.fn().mockResolvedValue({ value: [], lineId: 'line-1' }),
    }
    const services = {
      deviceIdentity: { getOrCreate },
      login: { reauthenticate: vi.fn().mockResolvedValue({ id: 'profile-2' }) },
      media,
      queryClient: { invalidateQueries },
    } as unknown as AppServices

    await withServices(services, async (store) => {
      const mediaStore = useMediaStore()
      await mediaStore.loadHome('profile-2')
      expect(mediaStore.connectionStatus('profile-2')).toBe('unhealthy')
      await store.reauthenticate('profile-2', 'new-password')
      expect(media.getLibraries).toHaveBeenCalledOnce()
      expect(mediaStore.connectionStatus('profile-2')).toBe('unknown')
      expect(invalidateQueries).toHaveBeenCalled()
    })
  })

  it('propagates a UserMismatch rejection to the caller', async () => {
    const services = {
      deviceIdentity: { getOrCreate },
      login: {
        reauthenticate: vi.fn().mockRejectedValue(new AppError('UserMismatch', 'mismatch')),
      },
    } as unknown as AppServices
    await withServices(services, async (store) => {
      await expect(store.reauthenticate('profile-2', 'pw')).rejects.toMatchObject({
        code: 'UserMismatch',
      })
    })
  })
})
