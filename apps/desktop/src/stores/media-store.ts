import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ItemQuery, Library, MediaItem, Page } from '@lumaroute/core'
import { injectServices } from '../composition/inject-services'
import {
  connectionErrorMessage,
  isAbortError,
  type ServerConnectionStatus,
} from './server-connection-status'

type ConnectionEntry = {
  status: ServerConnectionStatus
  error: string | null
}

export const useMediaStore = defineStore('media', () => {
  const libraries = ref<readonly Library[]>([])
  const continueWatching = ref<readonly MediaItem[]>([])
  const page = ref<Page<MediaItem> | null>(null)
  const searchResults = ref<Page<MediaItem> | null>(null)
  const detailItem = ref<MediaItem | null>(null)
  const detailChildren = ref<readonly MediaItem[]>([])
  const activeLineId = ref<string | null>(null)
  const connections = ref<Record<string, ConnectionEntry>>({})
  let homeController: AbortController | null = null
  let homeGeneration = 0
  let pageController: AbortController | null = null
  let searchController: AbortController | null = null

  function connectionStatus(profileId: string): ServerConnectionStatus {
    return connections.value[profileId]?.status ?? 'unknown'
  }

  function connectionError(profileId: string): string | null {
    return connections.value[profileId]?.error ?? null
  }

  function setConnection(profileId: string, entry: ConnectionEntry): void {
    connections.value = { ...connections.value, [profileId]: entry }
  }

  async function loadHome(serverId: string, signal?: AbortSignal): Promise<void> {
    const services = injectServices()
    const generation = ++homeGeneration
    homeController?.abort()
    homeController = signal ? null : new AbortController()
    const activeSignal = signal ?? homeController!.signal
    const onExternalAbort = () => {
      if (generation === homeGeneration) homeGeneration += 1
    }
    if (signal) {
      if (signal.aborted) onExternalAbort()
      else signal.addEventListener('abort', onExternalAbort, { once: true })
    }

    setConnection(serverId, { status: 'checking', error: null })
    libraries.value = []
    continueWatching.value = []
    activeLineId.value = null

    try {
      const [libraryResult, resumeResult] = await Promise.all([
        services.media.getLibraries(serverId, activeSignal),
        services.media.getContinueWatching(serverId, activeSignal),
      ])
      if (generation !== homeGeneration) return
      libraries.value = libraryResult.value
      continueWatching.value = resumeResult.value
      activeLineId.value = resumeResult.lineId
      setConnection(serverId, { status: 'healthy', error: null })
    } catch (error) {
      if (generation !== homeGeneration || isAbortError(error) || activeSignal.aborted) return
      setConnection(serverId, {
        status: 'unhealthy',
        error: connectionErrorMessage(error),
      })
    } finally {
      if (signal) signal.removeEventListener('abort', onExternalAbort)
    }
  }

  async function loadLibraryPage(
    serverId: string,
    query: ItemQuery,
    signal?: AbortSignal,
  ): Promise<void> {
    const services = injectServices()
    pageController?.abort()
    pageController = signal ? null : new AbortController()
    const activeSignal = signal ?? pageController!.signal
    const result = await services.media.getItems(serverId, query, activeSignal)
    page.value = result.value
    activeLineId.value = result.lineId
  }

  async function searchCurrentServer(serverId: string, term: string): Promise<void> {
    const services = injectServices()
    searchController?.abort()
    searchController = new AbortController()
    if (!term.trim()) {
      searchResults.value = { items: [], total: 0, startIndex: 0 }
      return
    }
    const result = await services.media.search(
      serverId,
      {
        term,
        kinds: ['movie', 'series', 'season', 'episode'],
        startIndex: 0,
        limit: 40,
      },
      searchController.signal,
    )
    searchResults.value = result.value
    activeLineId.value = result.lineId
  }

  function abortSearch(): void {
    searchController?.abort()
    searchController = null
  }

  return {
    libraries,
    continueWatching,
    page,
    searchResults,
    detailItem,
    detailChildren,
    activeLineId,
    connectionStatus,
    connectionError,
    loadHome,
    loadLibraryPage,
    searchCurrentServer,
    abortSearch,
  }
})
