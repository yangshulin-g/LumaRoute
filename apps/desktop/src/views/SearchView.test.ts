import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem, ServerProfile } from '@lumaroute/core'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import { useServerStore } from '../stores/server-store'
import SearchView from './SearchView.vue'

const movie: MediaItem = {
  id: 'item-1',
  kind: 'movie',
  name: 'Arrival',
  overview: 'A linguist works with the military.',
  productionYear: 2016,
  runtimeSeconds: 7200,
  parentId: null,
  seriesId: null,
  indexNumber: null,
  imageTag: 'tag-1',
  playbackPositionSeconds: 0,
}

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'emby',
  serverId: 'srv-1',
  userId: 'u-1',
  username: 'demo',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'line-2',
  lines: [
    { id: 'line-1', label: 'LAN', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
    { id: 'line-2', label: 'WAN', baseUrl: 'https://media.example', priority: 1, enabled: true },
  ],
}

function mountSearch(options: { activeServerId: string; results?: MediaItem[] }) {
  const results = options.results ?? [movie]
  const media = {
    getLibraries: vi.fn(),
    getContinueWatching: vi.fn(),
    getItems: vi.fn(),
    search: vi.fn().mockResolvedValue({
      value: { items: results, total: results.length, startIndex: 0 },
      lineId: 'line-1',
    }),
  }
  const services = { media } as unknown as AppServices
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', name: 'search', component: SearchView, props: true },
      { path: '/media/:itemId', name: 'media', component: { template: '<div />' } },
    ],
  })

  const wrapper = mount(SearchView, {
    props: { activeServerId: options.activeServerId },
    global: {
      plugins: [pinia, router],
      provide: { [servicesKey as symbol]: services },
      stubs: {
        RouterLink,
        VirtualPosterGrid: {
          props: ['items'],
          template: `
            <div data-testid="poster-grid">
              <div
                v-for="item in items"
                :key="item.id"
                data-testid="media-card"
              >{{ item.name }}</div>
            </div>
          `,
        },
      },
    },
  })

  return { wrapper, media, router }
}

describe('SearchView', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces 250 ms and scopes search to the active server', async () => {
    vi.useFakeTimers()
    const { wrapper, media, router } = mountSearch({ activeServerId: 'profile-2' })
    await router.push('/search')
    await wrapper.get('[name="search"]').setValue('Arrival')
    await vi.advanceTimersByTimeAsync(249)
    expect(media.search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(media.search).toHaveBeenCalledWith(
      'profile-2',
      {
        term: 'Arrival',
        kinds: ['movie', 'series', 'season', 'episode'],
        startIndex: 0,
        limit: 40,
      },
      expect.any(AbortSignal),
    )
    await flushPromises()
    expect(wrapper.text()).toContain(movie.name)
  })

  it('shows the resolved active line label instead of the raw line id', async () => {
    vi.useFakeTimers()
    const { wrapper, router } = mountSearch({ activeServerId: 'profile-1' })
    wrapper.vm.$.appContext.app.runWithContext(() => {
      useServerStore().profiles = [profile]
    })
    await router.push('/search')
    expect(wrapper.get('[data-testid="active-line"]').text()).toContain('尚无活动线路')
    await wrapper.get('[name="search"]').setValue('Arrival')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    const line = wrapper.get('[data-testid="active-line"]').text()
    expect(line).toContain('LAN')
    expect(line).not.toContain('line-1')
    expect(line).not.toContain('WAN')
  })

  it('replaces the grid with an empty state when the current server has no matches', async () => {
    vi.useFakeTimers()
    const { wrapper, media, router } = mountSearch({ activeServerId: 'profile-2', results: [] })
    await router.push('/search')
    await wrapper.get('[name="search"]').setValue('Nothing')
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    expect(media.search).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="search-no-results"]').text()).toBe('当前服务器没有匹配的结果。')
    expect(wrapper.find('[data-testid="poster-grid"]').exists()).toBe(false)
  })
})
