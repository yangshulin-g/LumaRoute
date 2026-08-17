import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@lumaroute/core'
import VirtualPosterGrid from './VirtualPosterGrid.vue'

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
  playbackPositionSeconds: 0,
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 800
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 600
    },
  })
})

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
})

function mountGrid(options: {
  itemCount: number
  hasNextPage?: boolean
  loadNext?: () => void
}): VueWrapper {
  const items = Array.from({ length: options.itemCount }, (_, index) => ({
    ...movie,
    id: `item-${index}`,
    name: `Movie ${index}`,
  }))
  return mount(VirtualPosterGrid, {
    props: {
      items,
      profileId: 'profile-1',
      estimateSize: 260,
      overscan: 3,
      hasNextPage: options.hasNextPage ?? false,
      ...(options.loadNext ? { onLoadNext: options.loadNext } : {}),
    },
    attachTo: document.body,
    global: {
      stubs: {
        MediaCard: {
          props: ['item'],
          template: '<div data-testid="media-card">{{ item.name }}</div>',
        },
      },
    },
  })
}

async function scrollToEnd(wrapper: VueWrapper): Promise<void> {
  const scroll = wrapper.find('.poster-scroll').element as HTMLDivElement
  Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 20_000 })
  Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 800 })
  scroll.scrollTop = 19_000
  scroll.dispatchEvent(new Event('scroll'))
  await nextTick()
  await nextTick()
}

describe('VirtualPosterGrid', () => {
  it('keeps DOM nodes bounded for ten thousand logical items', async () => {
    const items = Array.from({ length: 10_000 }, (_, index) => ({
      ...movie,
      id: `item-${index}`,
      name: `Movie ${index}`,
    }))
    const wrapper = mount(VirtualPosterGrid, {
      props: { items, profileId: 'profile-1', estimateSize: 260, overscan: 3 },
      attachTo: document.body,
      global: {
        stubs: {
          MediaCard: {
            props: ['item'],
            template: '<div data-testid="media-card">{{ item.name }}</div>',
          },
        },
      },
    })
    await nextTick()
    await nextTick()
    const cardCount = wrapper.findAll('[data-testid="media-card"]').length
    expect(cardCount).toBeGreaterThan(0)
    expect(cardCount).toBeLessThanOrEqual(150)
    wrapper.unmount()
  })

  it('requests the next server page near the viewport end', async () => {
    const loadNext = vi.fn()
    const wrapper = mountGrid({ itemCount: 60, hasNextPage: true, loadNext })
    await scrollToEnd(wrapper)
    expect(loadNext).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('renders movie, series, season, and episode cards', async () => {
    const items: MediaItem[] = [
      { ...movie, id: 'm1', kind: 'movie', name: 'Movie' },
      { ...movie, id: 's1', kind: 'series', name: 'Series' },
      { ...movie, id: 'season-1', kind: 'season', name: 'Season 1' },
      { ...movie, id: 'e1', kind: 'episode', name: 'Episode 1' },
    ]
    const wrapper = mount(VirtualPosterGrid, {
      props: { items, profileId: 'profile-1', estimateSize: 220 },
      attachTo: document.body,
      global: {
        stubs: {
          MediaCard: {
            props: ['item'],
            template: '<div data-testid="media-card" :data-kind="item.kind">{{ item.name }}</div>',
          },
        },
      },
    })
    await nextTick()
    await nextTick()
    expect(wrapper.text()).toContain('Movie')
    expect(wrapper.text()).toContain('Series')
    expect(wrapper.text()).toContain('Season 1')
    expect(wrapper.text()).toContain('Episode 1')
    wrapper.unmount()
  })

  it('lays out a multi-column poster wall for a wide viewport', async () => {
    const wrapper = mountGrid({ itemCount: 12 })
    await nextTick()
    await nextTick()
    const firstRow = wrapper.get('[data-row-index="0"]')
    expect(firstRow.attributes('style')).toMatch(/repeat\(3/)
    expect(firstRow.findAll('[data-testid="media-card"]')).toHaveLength(3)
    wrapper.unmount()
  })
})
