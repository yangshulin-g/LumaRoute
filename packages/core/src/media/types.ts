import type { ServerLine } from '../server/types'

export interface Library {
  id: string
  name: string
  collectionType: string | null
}

export type MediaKind = 'movie' | 'series' | 'season' | 'episode'

export interface MediaItem {
  id: string
  kind: MediaKind
  name: string
  overview: string | null
  productionYear: number | null
  runtimeSeconds: number | null
  parentId: string | null
  seriesId: string | null
  indexNumber: number | null
  imageTag: string | null
  playbackPositionSeconds: number
}

export interface Page<T> {
  items: readonly T[]
  total: number
  startIndex: number
}

export interface ItemQuery {
  libraryId?: string
  parentId?: string
  ids?: readonly string[]
  kinds?: readonly MediaKind[]
  startIndex: number
  limit: number
}

export interface SearchQuery {
  term: string
  kinds?: readonly MediaKind[]
  startIndex: number
  limit: number
}

export interface RequestContext {
  profileId: string
  line: ServerLine
  userId: string
  accessToken: string
  signal?: AbortSignal
}
