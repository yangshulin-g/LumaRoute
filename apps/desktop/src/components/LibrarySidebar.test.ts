import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { AppError, type Library } from '@lumaroute/core'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import { useMediaStore } from '../stores/media-store'
import LibrarySidebar from './LibrarySidebar.vue'

const library: Library = {
  id: 'lib-1',
  name: 'Movies',
  collectionType: 'movies',
}

function mountSidebar(options: {
  serverId: string | null
  media?: Partial<AppServices['media']>
}) {
  const media = {
    getLibraries: vi.fn().mockResolvedValue({ value: [library], lineId: 'line-1' }),
    getContinueWatching: vi.fn().mockResolvedValue({ value: [], lineId: 'line-1' }),
    getItems: vi.fn(),
    search: vi.fn(),
    ...options.media,
  }
  const services = { media } as unknown as AppServices
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  setActivePinia(pinia)
  app.provide(servicesKey, services)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/library/:libraryId', component: { template: '<div />' } },
    ],
  })

  const wrapper = mount(LibrarySidebar, {
    props: { serverId: options.serverId },
    global: {
      plugins: [pinia, router],
      provide: { [servicesKey as symbol]: services },
      stubs: { RouterLink },
    },
  })

  return {
    wrapper,
    media,
    async withStore<T>(operation: (store: ReturnType<typeof useMediaStore>) => Promise<T>) {
      return app.runWithContext(() => {
        const store = useMediaStore()
        return operation(store)
      })
    },
  }
}

describe('LibrarySidebar', () => {
  it('does not fetch libraries itself; parent/store owns the probe', async () => {
    const { wrapper, media } = mountSidebar({ serverId: 'profile-1' })
    await flushPromises()
    expect(media.getLibraries).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="library-sidebar-loading"]').exists()).toBe(true)
  })

  it('shows failure copy when the active server is unhealthy', async () => {
    const { wrapper, withStore } = mountSidebar({
      serverId: 'profile-1',
      media: {
        getLibraries: vi
          .fn()
          .mockRejectedValue(new AppError('AuthenticationExpired', 'unavailable')),
      },
    })
    await withStore((store) => store.loadHome('profile-1'))
    await flushPromises()
    expect(wrapper.get('[data-testid="library-sidebar-error"]').text()).toMatch(/凭证|钥匙串|重试/)
  })

  it('shows an empty-library message when healthy but no libraries', async () => {
    const { wrapper, withStore } = mountSidebar({
      serverId: 'profile-1',
      media: {
        getLibraries: vi.fn().mockResolvedValue({ value: [], lineId: 'line-1' }),
        getContinueWatching: vi.fn().mockResolvedValue({ value: [], lineId: 'line-1' }),
      },
    })
    await withStore((store) => store.loadHome('profile-1'))
    await flushPromises()
    expect(wrapper.get('[data-testid="library-sidebar-empty-libs"]').text()).toMatch(/空|暂无/)
  })
})
