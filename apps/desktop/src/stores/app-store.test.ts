import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import { useAppStore } from './app-store'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'

function createAppStoreHarness(overrides: Partial<AppServices> = {}) {
  const storage = {
    loadPreferences: vi.fn().mockResolvedValue({
      deviceId: null,
      activeServerId: 'profile-1',
      activeLibraryIdByServer: {},
      sensitiveLineIds: [],
    }),
    savePreferences: vi.fn().mockResolvedValue(undefined),
    listServerProfiles: vi.fn().mockResolvedValue([{ id: 'profile-1' }, { id: 'profile-2' }]),
  }
  const routes = {
    clearSession: vi.fn(),
  }
  const queryClient = {
    cancelQueries: vi.fn().mockResolvedValue(undefined),
  }

  const services = {
    storage,
    routes,
    queryClient,
    ...overrides,
  } as unknown as AppServices

  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  setActivePinia(pinia)
  app.provide(servicesKey, services)

  async function withStore<T>(
    operation: (store: ReturnType<typeof useAppStore>) => Promise<T>,
  ): Promise<T> {
    return app.runWithContext(() => {
      const store = useAppStore()
      return operation(store)
    })
  }

  return {
    storage,
    routes,
    queryClient,
    async selectServer(profileId: string | null): Promise<void> {
      await withStore((store) => store.initialize())
      await withStore((store) => store.selectServer(profileId))
    },
  }
}

describe('useAppStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('persists the active server and clears stale route/query state', async () => {
    const app = createAppStoreHarness()
    await app.selectServer('profile-2')
    expect(app.storage.savePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        activeServerId: 'profile-2',
      }),
    )
    expect(app.routes.clearSession).toHaveBeenCalledWith('profile-1')
    expect(app.queryClient.cancelQueries).toHaveBeenCalledWith({
      predicate: expect.any(Function),
    })
  })

  it('aborts old-server queries before publishing the new server', async () => {
    const order: string[] = []
    const app = createApp({})
    const pinia = createPinia()
    app.use(pinia)
    setActivePinia(pinia)

    const storage = {
      loadPreferences: vi.fn().mockResolvedValue({
        deviceId: null,
        activeServerId: 'profile-1',
        activeLibraryIdByServer: {},
        sensitiveLineIds: [],
      }),
      savePreferences: vi.fn().mockImplementation(async () => {
        order.push('save')
      }),
      listServerProfiles: vi.fn().mockResolvedValue([{ id: 'profile-1' }, { id: 'profile-2' }]),
    }
    const routes = { clearSession: vi.fn() }
    const queryClient = {
      cancelQueries: vi.fn().mockImplementation(async () => {
        order.push('cancel')
      }),
    }
    app.provide(servicesKey, {
      storage,
      routes,
      queryClient,
    } as unknown as AppServices)

    await app.runWithContext(() => {
      const store = useAppStore()
      return store.initialize()
    })

    await app.runWithContext(() => {
      const store = useAppStore()
      store.$subscribe((_mutation, state) => {
        if (state.activeServerId === 'profile-2' && !order.includes('publish')) {
          order.push('publish')
        }
      })
      return store.selectServer('profile-2')
    })

    expect(queryClient.cancelQueries).toHaveBeenCalled()
    expect(order.indexOf('cancel')).toBeLessThan(order.indexOf('publish'))
    expect(order.indexOf('save')).toBeLessThan(order.indexOf('publish'))
  })
})
