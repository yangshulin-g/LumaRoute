import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import { useServerStore } from './server-store'
import { servicesKey } from '../composition/inject-services'
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
  app.provide(servicesKey, services)
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
})
