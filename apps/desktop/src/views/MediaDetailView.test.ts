import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@lumaroute/core'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import MediaDetailView from './MediaDetailView.vue'

const movie: MediaItem = {
  id: 'movie-1',
  kind: 'movie',
  name: 'Arrival',
  overview: 'A linguist works with the military.',
  productionYear: 2016,
  runtimeSeconds: 7200,
  parentId: null,
  seriesId: null,
  indexNumber: null,
  imageTag: 'tag-1',
  playbackPositionSeconds: 120,
}

const series: MediaItem = {
  id: 'series-1',
  kind: 'series',
  name: 'The Expanse',
  overview: 'A detective investigates a missing girl.',
  productionYear: 2015,
  runtimeSeconds: null,
  parentId: null,
  seriesId: null,
  indexNumber: null,
  imageTag: 'tag-series',
  playbackPositionSeconds: 0,
}

const season: MediaItem = {
  id: 'season-1',
  kind: 'season',
  name: 'Season 1',
  overview: null,
  productionYear: 2015,
  runtimeSeconds: null,
  parentId: 'series-1',
  seriesId: 'series-1',
  indexNumber: 1,
  imageTag: null,
  playbackPositionSeconds: 0,
}

const episode: MediaItem = {
  id: 'episode-1',
  kind: 'episode',
  name: 'Dulcinea',
  overview: null,
  productionYear: 2015,
  runtimeSeconds: 2700,
  parentId: 'season-1',
  seriesId: 'series-1',
  indexNumber: 1,
  imageTag: null,
  playbackPositionSeconds: 0,
}

function mountDetail(options: { itemId: string; serverId?: string }) {
  const media = {
    getLibraries: vi.fn(),
    getContinueWatching: vi.fn(),
    getItems: vi.fn().mockImplementation(async (_serverId: string, query: { ids?: string[]; parentId?: string; kinds?: string[] }) => {
      if (query.ids?.includes(movie.id)) {
        return {
          value: {
            items: [{ ...movie, playbackPositionSeconds: 120 }],
            total: 1,
            startIndex: 0,
          },
          lineId: 'line-1',
        }
      }
      if (query.ids?.includes(series.id)) {
        return {
          value: { items: [series], total: 1, startIndex: 0 },
          lineId: 'line-1',
        }
      }
      if (query.parentId === series.id && query.kinds?.includes('season')) {
        return {
          value: { items: [season], total: 1, startIndex: 0 },
          lineId: 'line-1',
        }
      }
      if (query.parentId === season.id && query.kinds?.includes('episode')) {
        return {
          value: { items: [episode], total: 1, startIndex: 0 },
          lineId: 'line-1',
        }
      }
      return { value: { items: [], total: 0, startIndex: 0 }, lineId: 'line-1' }
    }),
    search: vi.fn(),
  }
  const playback = {
    play: vi.fn().mockResolvedValue({
      plan: {
        itemId: movie.id,
        mediaSourceId: 'source-1',
        playSessionId: 'session-1',
        streamUrl: 'https://media.example/stream.mkv',
        requestHeaders: { 'X-Emby-Token': 'token-a' },
        container: 'mkv',
        videoCodec: 'h264',
        audioCodec: 'aac',
        bitrate: 8_000_000,
        durationSeconds: 7200,
        method: 'direct-play',
        startPositionSeconds: 0,
      },
      lineId: 'line-1',
    }),
  }
  const player = {
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    seek: vi.fn(),
    stop: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  }
  const progressReporter = {
    start: vi.fn(),
    handle: vi.fn().mockResolvedValue(undefined),
    whenIdle: vi.fn().mockResolvedValue(undefined),
    flushAndStop: vi.fn().mockResolvedValue(undefined),
  }
  const images = {
    load: vi.fn().mockResolvedValue(null),
    release: vi.fn(),
  }
  const services = { media, playback, player, progressReporter, images } as unknown as AppServices
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/media/:itemId',
        name: 'media',
        component: MediaDetailView,
        props: true,
      },
    ],
  })

  const wrapper = mount(MediaDetailView, {
    props: {
      serverId: options.serverId ?? 'profile-1',
      itemId: options.itemId,
    },
    global: {
      plugins: [pinia, router],
      provide: { [servicesKey as symbol]: services },
      stubs: { RouterLink },
    },
  })

  return { wrapper, media, playback }
}

function mountSeriesDetail() {
  return mountDetail({ itemId: series.id })
}

describe('MediaDetailView', () => {
  it('renders only the minimum movie detail and resume action', async () => {
    const { wrapper } = mountDetail({ itemId: movie.id })
    await flushPromises()
    expect(wrapper.text()).toContain(movie.name)
    expect(wrapper.text()).toContain(String(movie.productionYear))
    expect(wrapper.text()).toContain(movie.overview)
    expect(wrapper.get('[data-testid="resume"]').text()).toContain('02:00')
    expect(wrapper.find('[data-testid="cast"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="recommendations"]').exists()).toBe(false)
  })

  it('loads seasons for a series and episodes for the selected season', async () => {
    const { wrapper, media } = mountSeriesDetail()
    await flushPromises()
    expect(media.getItems).toHaveBeenCalledWith(
      'profile-1',
      expect.objectContaining({
        parentId: 'series-1',
        kinds: ['season'],
      }),
      expect.any(AbortSignal),
    )
    await wrapper.get('[data-season-id="season-1"]').trigger('click')
    expect(media.getItems).toHaveBeenCalledWith(
      'profile-1',
      expect.objectContaining({
        parentId: 'season-1',
        kinds: ['episode'],
      }),
      expect.any(AbortSignal),
    )
  })

  it('starts play from zero and resume from the saved position', async () => {
    const { wrapper, playback } = mountDetail({ itemId: movie.id })
    await flushPromises()
    await wrapper.get('[data-testid="play"]').trigger('click')
    await flushPromises()
    expect(playback.play).toHaveBeenCalledWith('profile-1', movie.id, 0)
    await wrapper.get('[data-testid="resume"]').trigger('click')
    await flushPromises()
    expect(playback.play).toHaveBeenCalledWith('profile-1', movie.id, 120)
  })

  it('shows a loading state instead of a blank page while detail is fetching', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const getItems = vi.fn().mockImplementation(async () => {
      await gate
      return {
        value: {
          items: [{ ...movie, playbackPositionSeconds: 120 }],
          total: 1,
          startIndex: 0,
        },
        lineId: 'line-1',
      }
    })
    const wrapper = mountDetailWithMedia({
      itemId: movie.id,
      media: {
        getLibraries: vi.fn(),
        getContinueWatching: vi.fn(),
        getItems,
        search: vi.fn(),
      },
    })
    expect(wrapper.find('[data-testid="detail-loading"]').exists()).toBe(true)
    expect(wrapper.find('.media-detail').exists()).toBe(false)
    release()
    await flushPromises()
    expect(wrapper.text()).toContain(movie.name)
  })

  it('shows an error state instead of a blank page when detail load fails', async () => {
    const wrapper = mountDetailWithMedia({
      itemId: movie.id,
      media: {
        getLibraries: vi.fn(),
        getContinueWatching: vi.fn(),
        getItems: vi.fn().mockRejectedValue(new Error('HTTP 500')),
        search: vi.fn(),
      },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="detail-error"]').exists()).toBe(true)
    expect(wrapper.find('.media-detail').exists()).toBe(false)
  })
})

function mountDetailWithMedia(options: {
  itemId: string
  serverId?: string
  media: {
    getLibraries: ReturnType<typeof vi.fn>
    getContinueWatching: ReturnType<typeof vi.fn>
    getItems: ReturnType<typeof vi.fn>
    search: ReturnType<typeof vi.fn>
  }
}) {
  const playback = { play: vi.fn() }
  const services = {
    media: options.media,
    playback,
    player: {
      play: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      seek: vi.fn(),
      stop: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    },
    progressReporter: {
      start: vi.fn(),
      handle: vi.fn(),
      whenIdle: vi.fn(),
      flushAndStop: vi.fn(),
    },
    images: { load: vi.fn().mockResolvedValue(null), release: vi.fn() },
  } as unknown as AppServices
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/media/:itemId', name: 'media', component: MediaDetailView, props: true }],
  })
  return mount(MediaDetailView, {
    props: {
      serverId: options.serverId ?? 'profile-1',
      itemId: options.itemId,
    },
    global: {
      plugins: [pinia, router],
      provide: { [servicesKey as symbol]: services },
      stubs: { RouterLink },
    },
  })
}
