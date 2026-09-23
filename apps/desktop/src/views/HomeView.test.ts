import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { Library, MediaItem, ServerProfile } from '@lumaroute/core'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import { useServerStore } from '../stores/server-store'
import HomeView from './HomeView.vue'

const movie: MediaItem = {
  id: 'item-1',
  kind: 'movie',
  name: 'Arrival',
  overview: null,
  productionYear: 2016,
  runtimeSeconds: 7200,
  parentId: null,
  seriesId: null,
  indexNumber: null,
  imageTag: 'tag-1',
  playbackPositionSeconds: 120,
}

const library: Library = {
  id: 'lib-1',
  name: 'Movies',
  collectionType: 'movies',
}

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'test',
  kind: 'emby',
  serverId: 'srv-1',
  userId: 'u-1',
  username: 'demo',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'line-1',
  lines: [
    { id: 'line-1', label: 'Primary', baseUrl: 'https://emby.example', priority: 0, enabled: true },
    { id: 'line-2', label: 'Backup', baseUrl: 'http://backup.example', priority: 1, enabled: true },
  ],
}

function mountHome(options: { activeServerId: string }) {
  const media = {
    getContinueWatching: vi.fn().mockResolvedValue({ value: [movie], lineId: 'line-2' }),
    getLibraries: vi.fn().mockResolvedValue({ value: [library], lineId: 'line-2' }),
    getItems: vi.fn(),
    search: vi.fn(),
  }
  const services = { media } as unknown as AppServices
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  setActivePinia(pinia)
  app.provide(servicesKey, services)
  app.runWithContext(() => {
    useServerStore().profiles = [profile]
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/library/:libraryId', name: 'library', component: { template: '<div />' } },
      { path: '/media/:itemId', name: 'media', component: { template: '<div />' } },
    ],
  })

  const wrapper = mount(HomeView, {
    props: { activeServerId: options.activeServerId },
    global: {
      plugins: [pinia, router],
      provide: { [servicesKey as symbol]: services },
      stubs: {
        RouterLink,
        MediaCard: {
          props: ['item'],
          template: '<div data-testid="media-card">{{ item.name }}</div>',
        },
      },
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

describe('HomeView', () => {
  it('shows continue watching and library entries for the active server', async () => {
    const { wrapper, media, withStore } = mountHome({ activeServerId: 'profile-1' })
    await withStore((store) => store.loadHome('profile-1'))
    await flushPromises()
    expect(media.getLibraries).toHaveBeenCalled()
    expect(wrapper.text()).toContain('继续观看')
    expect(wrapper.text()).toContain(movie.name)
    expect(wrapper.text()).toContain(library.name)
    expect(wrapper.get('[data-testid="active-line"]').text()).toContain('Backup')
    expect(wrapper.text()).toContain('连接状态：连接正常')
    expect(wrapper.find('[data-testid="spotlight-rating"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="recommendations"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="continue-progress"]').text()).toBe('2%')
    expect(wrapper.get('[data-testid="library-bento-lib-1"]').text()).toContain('Movies')
  })

  it('shows a loading state before the parent probe finishes', async () => {
    const { wrapper } = mountHome({ activeServerId: 'profile-1' })
    expect(wrapper.find('[data-testid="home-loading"]').exists()).toBe(true)
  })

  it('uses the app-store active server when route props are still missing', async () => {
    const { wrapper, withStore } = mountHome({ activeServerId: 'missing' })
    await withStore(async (store) => {
      useAppStore().activeServerId = 'profile-1'
      await store.loadHome('profile-1')
    })
    await flushPromises()
    expect(wrapper.text()).toContain('继续观看')
    expect(wrapper.text()).toContain(library.name)
    expect(wrapper.find('[data-testid="home-loading"]').exists()).toBe(false)
  })
})
