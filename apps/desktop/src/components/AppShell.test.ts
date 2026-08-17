import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { Library, MediaItem, ServerProfile } from '@lumaroute/core'
import { provideServices, servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import { useServerStore } from '../stores/server-store'
import AppShell from './AppShell.vue'
import HomeView from '../views/HomeView.vue'

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
  name: '动画电影',
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
    {
      id: 'line-1',
      label: 'Primary',
      baseUrl: 'https://emby.example',
      priority: 0,
      enabled: true,
    },
  ],
}

describe('AppShell home content', () => {
  it('shows home shelves after load even when route props were snapshotted as missing', async () => {
    const media = {
      getLibraries: vi.fn().mockResolvedValue({ value: [library], lineId: 'line-1' }),
      getContinueWatching: vi.fn().mockResolvedValue({ value: [movie], lineId: 'line-1' }),
      getItems: vi.fn(),
      search: vi.fn(),
    }
    const services = {
      media,
      storage: {
        loadPreferences: vi.fn().mockResolvedValue({ activeServerId: profile.id }),
        savePreferences: vi.fn(),
        listServerProfiles: vi.fn().mockResolvedValue([profile]),
        getServerProfile: vi.fn().mockResolvedValue(profile),
      },
      routes: { clearSession: vi.fn() },
      queryClient: { cancelQueries: vi.fn() },
    } as unknown as AppServices

    const app = createApp({})
    const pinia = createPinia()
    app.use(pinia)
    setActivePinia(pinia)
    provideServices(app, services)

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/',
          component: AppShell,
          children: [
            {
              path: '',
              name: 'home',
              component: HomeView,
              props: () => ({
                activeServerId: useAppStore().activeServerId ?? 'missing',
              }),
            },
            { path: 'library/:libraryId', component: { template: '<div />' } },
            { path: 'settings', component: { template: '<div />' } },
          ],
        },
      ],
    })

    // Mimic bootstrap: initial navigation resolves props before activeServerId exists.
    await router.push('/')
    await router.isReady()
    expect(router.currentRoute.value.matched.at(-1)?.props).toBeTruthy()

    const appStore = useAppStore()
    appStore.activeServerId = profile.id
    const serverStore = useServerStore()
    serverStore.profiles = [profile]

    const wrapper = mount(AppShell, {
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

    await app.runWithContext(async () => {
      const mediaStore = useMediaStore()
      await mediaStore.loadHome(profile.id)
    })
    await flushPromises()

    expect(wrapper.text()).toContain('继续观看')
    expect(wrapper.text()).toContain(movie.name)
    expect(wrapper.text()).toContain(library.name)
    expect(wrapper.find('[data-testid="home-loading"]').exists()).toBe(false)
  })
})
