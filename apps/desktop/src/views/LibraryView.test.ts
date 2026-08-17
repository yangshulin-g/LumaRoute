import { flushPromises, mount } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@lumaroute/core'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
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

function mountLibrary(options: { serverId: string; libraryId: string }) {
  const media = {
    getLibraries: vi.fn(),
    getContinueWatching: vi.fn(),
    getItems: vi.fn().mockResolvedValue({
      value: { items: [series], total: 1, startIndex: 0 },
      lineId: 'line-1',
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
            <div>
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
})
