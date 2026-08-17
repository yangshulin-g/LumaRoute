import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import { AppError, type Library, type MediaItem } from '@lumaroute/core'
import { servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import { useMediaStore } from './media-store'

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

function createMediaStoreHarness(mediaOverrides: Partial<AppServices['media']> = {}) {
  const media = {
    getLibraries: vi.fn().mockResolvedValue({ value: [library], lineId: 'line-2' }),
    getContinueWatching: vi.fn().mockResolvedValue({ value: [movie], lineId: 'line-2' }),
    getItems: vi.fn().mockResolvedValue({
      value: { items: [movie], total: 1, startIndex: 0 },
      lineId: 'line-2',
    }),
    search: vi.fn(),
    ...mediaOverrides,
  }

  const services = { media } as unknown as AppServices
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  setActivePinia(pinia)
  app.provide(servicesKey, services)

  return {
    media,
    async withStore<T>(operation: (store: ReturnType<typeof useMediaStore>) => Promise<T>) {
      return app.runWithContext(() => {
        const store = useMediaStore()
        return operation(store)
      })
    },
  }
}

describe('useMediaStore', () => {
  it('loads home libraries and continue watching from the active line', async () => {
    const harness = createMediaStoreHarness()
    await harness.withStore(async (store) => {
      await store.loadHome('profile-1')
      expect(store.libraries).toEqual([library])
      expect(store.continueWatching).toEqual([movie])
      expect(store.activeLineId).toBe('line-2')
      expect(store.connectionStatus('profile-1')).toBe('healthy')
      expect(store.connectionError('profile-1')).toBeNull()
    })
  })

  it('marks the server unhealthy when credentials are unavailable instead of staying blank', async () => {
    const harness = createMediaStoreHarness({
      getLibraries: vi
        .fn()
        .mockRejectedValue(new AppError('AuthenticationExpired', 'Server credential is unavailable')),
      getContinueWatching: vi.fn().mockResolvedValue({ value: [], lineId: 'line-1' }),
    })
    await harness.withStore(async (store) => {
      await store.loadHome('profile-1')
      expect(store.libraries).toEqual([])
      expect(store.connectionStatus('profile-1')).toBe('unhealthy')
      expect(store.connectionError('profile-1')).toMatch(/凭证|钥匙串|重新登录/)
    })
  })

  it('exposes checking while home load is in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const harness = createMediaStoreHarness({
      getLibraries: vi.fn().mockImplementation(async () => {
        await gate
        return { value: [library], lineId: 'line-2' }
      }),
      getContinueWatching: vi.fn().mockImplementation(async () => {
        await gate
        return { value: [movie], lineId: 'line-2' }
      }),
    })
    await harness.withStore(async (store) => {
      const pending = store.loadHome('profile-1')
      expect(store.connectionStatus('profile-1')).toBe('checking')
      release()
      await pending
      expect(store.connectionStatus('profile-1')).toBe('healthy')
    })
  })

  it('ignores abort errors so a superseded load does not mark the server unhealthy', async () => {
    const harness = createMediaStoreHarness({
      getLibraries: vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
      getContinueWatching: vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
    })
    await harness.withStore(async (store) => {
      await store.loadHome('profile-1')
      expect(store.connectionStatus('profile-1')).not.toBe('unhealthy')
    })
  })

  it('keeps the newer home result when overlapping loads race', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let round = 0
    const harness = createMediaStoreHarness({
      getLibraries: vi.fn().mockImplementation(async (_id: string, signal?: AbortSignal) => {
        const current = ++round
        if (current === 1) {
          await firstGate
          signal?.throwIfAborted()
          return { value: [], lineId: 'line-stale' }
        }
        return { value: [library], lineId: 'line-2' }
      }),
      getContinueWatching: vi.fn().mockImplementation(async (_id: string, signal?: AbortSignal) => {
        const current = round
        if (current === 1) {
          await firstGate
          signal?.throwIfAborted()
          return { value: [], lineId: 'line-stale' }
        }
        return { value: [movie], lineId: 'line-2' }
      }),
    })
    await harness.withStore(async (store) => {
      const first = store.loadHome('profile-1')
      const second = store.loadHome('profile-1')
      releaseFirst()
      await Promise.allSettled([first, second])
      expect(store.libraries).toEqual([library])
      expect(store.continueWatching).toEqual([movie])
      expect(store.connectionStatus('profile-1')).toBe('healthy')
    })
  })

  it('loads a 60-item library page', async () => {
    const harness = createMediaStoreHarness()
    await harness.withStore(async (store) => {
      await store.loadLibraryPage('profile-1', {
        libraryId: 'lib-1',
        startIndex: 0,
        limit: 60,
        kinds: ['movie', 'series'],
      })
      expect(harness.media.getItems).toHaveBeenCalledWith(
        'profile-1',
        {
          libraryId: 'lib-1',
          startIndex: 0,
          limit: 60,
          kinds: ['movie', 'series'],
        },
        expect.any(AbortSignal),
      )
      expect(store.page?.items).toEqual([movie])
      expect(store.activeLineId).toBe('line-2')
    })
  })
})
