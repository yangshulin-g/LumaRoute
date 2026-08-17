import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@lumaroute/core'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
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

function mountSearch(options: { activeServerId: string }) {
  const media = {
    getLibraries: vi.fn(),
    getContinueWatching: vi.fn(),
    getItems: vi.fn(),
    search: vi.fn().mockResolvedValue({
      value: { items: [movie], total: 1, startIndex: 0 },
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
            <div>
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
})
