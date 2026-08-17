import type { AuthSession, LoginInput } from '../auth/types'
import type { ItemQuery, Library, MediaItem, Page, RequestContext, SearchQuery } from './types'
import type { PlaybackPlan } from '@lumaroute/player'
import type { PlaybackReport } from '../playback/progress-reporter'

export interface MediaServerAdapter {
  authenticate(input: LoginInput): Promise<AuthSession>
  getLibraries(context: RequestContext): Promise<Library[]>
  getItems(query: ItemQuery, context: RequestContext): Promise<Page<MediaItem>>
  getContinueWatching(context: RequestContext): Promise<MediaItem[]>
  search(query: SearchQuery, context: RequestContext): Promise<Page<MediaItem>>
  getPlaybackPlan(itemId: string, context: RequestContext): Promise<PlaybackPlan>
  reportPlayback(event: PlaybackReport, context: RequestContext): Promise<void>
}

export type MediaBrowseAdapter = Pick<
  MediaServerAdapter,
  'getLibraries' | 'getItems' | 'getContinueWatching' | 'search'
>

export type MediaPlaybackAdapter = Pick<MediaServerAdapter, 'getPlaybackPlan'>
