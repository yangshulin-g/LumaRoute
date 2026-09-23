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

async function mountPopulatedShell() {
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
      { path: '/onboarding', name: 'onboarding', component: { template: '<div />' } },
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
          { path: 'settings', name: 'settings', component: { template: '<div />' } },
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
    attachTo: document.body,
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

  return { wrapper, app, services, router }
}

describe('AppShell home content', () => {
  it('shows home shelves after load even when route props were snapshotted as missing', async () => {
    const { wrapper } = await mountPopulatedShell()

    expect(wrapper.text()).toContain('继续观看')
    expect(wrapper.text()).toContain(movie.name)
    expect(wrapper.text()).toContain(library.name)
    expect(wrapper.find('[data-testid="home-loading"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows only the real active line in the HUD without falling back to the preferred line', async () => {
    const { wrapper, app } = await mountPopulatedShell()
    const pill = wrapper.get('[data-testid="line-status-pill"]')
    expect(pill.text()).toContain('Primary')
    expect(pill.attributes('data-status')).toBe('healthy')

    await app.runWithContext(async () => {
      useMediaStore().activeLineId = null
    })
    await flushPromises()
    expect(pill.text()).toContain('尚无活动线路')
    expect(pill.text()).not.toContain('Primary')
    wrapper.unmount()
  })

  it('returns to onboarding and stops rendering shell content after the last server is removed', async () => {
    const { wrapper, app, router } = await mountPopulatedShell()
    expect(wrapper.findComponent(HomeView).exists()).toBe(true)
    await app.runWithContext(async () => {
      useServerStore().profiles = []
    })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('onboarding')
    expect(wrapper.findComponent(HomeView).exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens add-server onboarding from the sidebar plus button', async () => {
    const { wrapper, router } = await mountPopulatedShell()
    await wrapper.get('[data-testid="add-server"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/onboarding?mode=add')
    wrapper.unmount()
  })

  it('focuses current-server search on Ctrl+K without changing its scope', async () => {
    const { wrapper } = await mountPopulatedShell()
    const input = wrapper.get('[data-testid="current-server-search"]').element as HTMLInputElement
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('placeholder')).toBe('搜索当前服务器')
    wrapper.unmount()
  })

  it('focuses current-server search on Meta+K using the physical key code', async () => {
    const { wrapper } = await mountPopulatedShell()
    const input = wrapper.get('[data-testid="current-server-search"]').element as HTMLInputElement
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'л', code: 'KeyK', metaKey: true }))
    expect(document.activeElement).toBe(input)
    wrapper.unmount()
  })

  it('ignores the search shortcut while an IME composition is active', async () => {
    const { wrapper } = await mountPopulatedShell()
    const input = wrapper.get('[data-testid="current-server-search"]').element as HTMLInputElement
    input.blur()
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', metaKey: true, isComposing: true }),
    )
    expect(document.activeElement).not.toBe(input)
    wrapper.unmount()
  })

  it('reflects a non-healthy connection status on the HUD pill', async () => {
    const { wrapper, app, services } = await mountPopulatedShell()
    vi.mocked(services.media.getLibraries).mockRejectedValueOnce(new Error('offline'))
    await app.runWithContext(async () => {
      await useMediaStore().loadHome(profile.id)
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="line-status-pill"]').attributes('data-status')).toBe(
      'unhealthy',
    )
    wrapper.unmount()
  })
})
