import { flushPromises, mount } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { MediaItem, ServerProfile } from '@lumaroute/core'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import { useServerStore } from '../stores/server-store'
import LibraryView from './LibraryView.vue'

const series: MediaItem = {
  id: 'series-1',
  kind: 'series',
  name: 'The Expanse',
  overview: null,
  productionYear: 2015,
  runtimeSeconds: null,
  parentId: null,
  seriesId: null,
  indexNumber: null,
  imageTag: 'tag-series',
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

function mountLibrary(options: {
  serverId: string
  libraryId: string
  items?: MediaItem[]
  lineId?: string
}) {
  const items = options.items ?? [series]
  const media = {
    getLibraries: vi.fn(),
    getContinueWatching: vi.fn(),
    getItems: vi.fn().mockResolvedValue({
      value: { items, total: items.length, startIndex: 0 },
      lineId: options.lineId ?? 'line-1',
    }),
    search: vi.fn(),
  }
  const services = { media } as unknown as AppServices
  const pinia = createPinia()
  setActivePinia(pinia)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/library/:libraryId',
        name: 'library',
        component: LibraryView,
        props: true,
      },
      { path: '/media/:itemId', name: 'media', component: { template: '<div />' } },
    ],
  })

  const wrapper = mount(LibraryView, {
    props: {
      serverId: options.serverId,
      libraryId: options.libraryId,
    },
    global: {
      plugins: [pinia, router, [VueQueryPlugin, { queryClient }]],
      provide: { [servicesKey as symbol]: services },
      stubs: {
        RouterLink,
        VirtualPosterGrid: {
          props: ['items'],
          template: `
            <div data-testid="poster-grid">
              <a
                v-for="item in items"
                :key="item.id"
                :data-item-id="item.id"
                :href="\`/media/\${item.id}\`"
              >{{ item.name }}</a>
            </div>
          `,
        },
      },
    },
  })

  return { wrapper, media }
}

describe('LibraryView', () => {
  it('requests a 60-item server page and links series to seasons', async () => {
    const { wrapper, media } = mountLibrary({ serverId: 'profile-1', libraryId: 'lib-1' })
    await flushPromises()
    expect(media.getItems).toHaveBeenCalledWith(
      'profile-1',
      {
        libraryId: 'lib-1',
        startIndex: 0,
        limit: 60,
        kinds: ['movie', 'series'],
      },
      expect.any(AbortSignal),
    )
    expect(wrapper.get(`[data-item-id="${series.id}"]`).attributes('href')).toContain(
      `/media/${series.id}`,
    )
  })

  it('shows the server-reported total for the library', async () => {
    const { wrapper } = mountLibrary({ serverId: 'profile-1', libraryId: 'lib-1' })
    await flushPromises()
    expect(wrapper.get('[data-testid="library-count"]').text()).toBe('共 1 项')
  })

  it('shows the resolved active line label instead of the raw line id', async () => {
    const { wrapper } = mountLibrary({ serverId: 'profile-1', libraryId: 'lib-1' })
    wrapper.vm.$.appContext.app.runWithContext(() => {
      useServerStore().profiles = [profile]
    })
    await flushPromises()
    const line = wrapper.get('[data-testid="active-line"]').text()
    expect(line).toContain('LAN')
    expect(line).not.toContain('line-1')
    expect(line).not.toContain('WAN')
  })

  it('does not fall back to the preferred line when the reported line is unknown', async () => {
    const { wrapper } = mountLibrary({
      serverId: 'profile-1',
      libraryId: 'lib-1',
      lineId: 'line-unknown',
    })
    wrapper.vm.$.appContext.app.runWithContext(() => {
      useServerStore().profiles = [profile]
    })
    await flushPromises()
    const line = wrapper.get('[data-testid="active-line"]').text()
    expect(line).toContain('尚无活动线路')
    expect(line).not.toContain('line-unknown')
    expect(line).not.toContain('WAN')
  })

  it('replaces the grid with an empty state when the library has no items', async () => {
    const { wrapper } = mountLibrary({ serverId: 'profile-1', libraryId: 'lib-1', items: [] })
    await flushPromises()
    expect(wrapper.get('[data-testid="library-empty"]').text()).toBe('此媒体库暂无内容')
    expect(wrapper.find('[data-testid="poster-grid"]').exists()).toBe(false)
  })
})
