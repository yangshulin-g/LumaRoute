import { AppError } from '../../errors/app-error'
import type { AuthenticationAdapter } from '../../auth/authentication-adapter'
import type { AuthSession, LoginInput } from '../../auth/types'
import type { MediaServerAdapter } from '../../media/media-server-adapter'
import type { ItemQuery, Library, MediaItem, Page, RequestContext, SearchQuery } from '../../media/types'
import type { PlaybackPlan } from '@lumaroute/player'
import type { PlaybackReport } from '../../playback/progress-reporter'
import type { HttpRequest, HttpResponse, HttpTransport } from '../../ports/http-transport'
import { assertSuccessfulResponse } from '../assert-http-response'
import type {
  EmbyAuthenticateResponseDto,
  EmbyItemsResultDto,
  EmbyPlaybackInfoDto,
  EmbyPublicSystemInfoDto,
  EmbyVirtualFolderDto,
} from './emby-dto'
import { mapEmbyAuthSession, mapItem, mapLibrary, selectPlaybackPlan, toProviderKind } from './emby-mapper'

export class EmbyAdapter implements AuthenticationAdapter, MediaServerAdapter {
  constructor(private readonly http: HttpTransport) {}

  async authenticate(input: LoginInput): Promise<AuthSession> {
    const authorization = `MediaBrowser Client="${input.deviceName}", Device="${input.deviceName}", DeviceId="${input.deviceId}", Version="${input.appVersion}"`
    const info = await this.http.request<EmbyPublicSystemInfoDto>({
      baseUrl: input.baseUrl,
      path: '/System/Info/Public',
      method: 'GET',
      ...(input.signal ? { signal: input.signal } : {}),
      timeoutMs: 8_000,
    })
    assertSuccessfulResponse(info)
    const auth = await this.http.request<EmbyAuthenticateResponseDto>({
      baseUrl: input.baseUrl,
      path: '/Users/AuthenticateByName',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Emby-Authorization': authorization },
      body: { Username: input.username, Pw: input.password },
      ...(input.signal ? { signal: input.signal } : {}),
      timeoutMs: 10_000,
    })
    assertSuccessfulResponse(auth, true)
    return mapEmbyAuthSession(info.data, auth.data)
  }

  async getServerIdentity(
    baseUrl: string,
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<{ serverId: string; serverName: string }> {
    const info = await this.http.request<EmbyPublicSystemInfoDto>({
      baseUrl,
      path: '/System/Info',
      method: 'GET',
      headers: { 'X-Emby-Token': accessToken },
      ...(signal ? { signal } : {}),
      timeoutMs: 8_000,
    })
    return { serverId: info.data.Id, serverName: info.data.ServerName }
  }

  async getLibraries(context: RequestContext): Promise<Library[]> {
    const response = await this.authorizedRequest<EmbyVirtualFolderDto[]>(context, {
      path: '/Library/VirtualFolders',
      method: 'GET',
    })
    return response.data.map(mapLibrary)
  }

  async getItems(query: ItemQuery, context: RequestContext): Promise<Page<MediaItem>> {
    const hasIds = Boolean(query.ids && query.ids.length > 0)
    const response = await this.authorizedRequest<EmbyItemsResultDto>(context, {
      path: `/Users/${context.userId}/Items`,
      method: 'GET',
      query: {
        ParentId: query.libraryId ?? query.parentId,
        Ids: query.ids?.join(','),
        IncludeItemTypes: query.kinds?.map(toProviderKind).join(','),
        Recursive: hasIds || query.parentId ? false : true,
        StartIndex: query.startIndex,
        Limit: query.limit,
        Fields: 'Overview,ProductionYear,RunTimeTicks,ParentId,SeriesId,IndexNumber',
        EnableImages: true,
      },
    })
    return {
      items: response.data.Items.map(mapItem),
      total: response.data.TotalRecordCount,
      startIndex: query.startIndex,
    }
  }

  async getContinueWatching(context: RequestContext): Promise<MediaItem[]> {
    const response = await this.authorizedRequest<EmbyItemsResultDto>(context, {
      path: `/Users/${context.userId}/Items/Resume`,
      method: 'GET',
      query: {
        Fields: 'Overview,ProductionYear,RunTimeTicks,ParentId,SeriesId,IndexNumber',
        EnableImages: true,
      },
    })
    return response.data.Items.map(mapItem)
  }

  async search(query: SearchQuery, context: RequestContext): Promise<Page<MediaItem>> {
    if (!query.term.trim()) return { items: [], total: 0, startIndex: query.startIndex }
    const response = await this.authorizedRequest<EmbyItemsResultDto>(context, {
      path: `/Users/${context.userId}/Items`,
      method: 'GET',
      query: {
        SearchTerm: query.term.trim(),
        IncludeItemTypes: query.kinds?.map(toProviderKind).join(','),
        Recursive: true,
        StartIndex: query.startIndex,
        Limit: Math.min(query.limit, 100),
        Fields: 'Overview,ProductionYear,RunTimeTicks,ParentId,SeriesId,IndexNumber',
        EnableImages: true,
      },
    })
    return {
      items: response.data.Items.map(mapItem),
      total: response.data.TotalRecordCount,
      startIndex: query.startIndex,
    }
  }

  async getPlaybackPlan(itemId: string, context: RequestContext): Promise<PlaybackPlan> {
    const response = await this.authorizedRequest<EmbyPlaybackInfoDto>(context, {
      path: `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`,
      method: 'POST',
      query: { UserId: context.userId },
      body: {},
    })
    return selectPlaybackPlan(itemId, response.data, context)
  }

  async reportPlayback(event: PlaybackReport, context: RequestContext): Promise<void> {
    const path =
      event.type === 'started'
        ? '/Sessions/Playing'
        : event.type === 'stopped'
          ? '/Sessions/Playing/Stopped'
          : '/Sessions/Playing/Progress'
    await this.authorizedRequest(context, {
      path,
      method: 'POST',
      body: {
        ItemId: event.itemId,
        MediaSourceId: event.mediaSourceId,
        PlaySessionId: event.playSessionId,
        PositionTicks: event.positionTicks,
        IsPaused: event.isPaused,
        CanSeek: true,
      },
    })
  }

  private async authorizedRequest<T>(
    context: RequestContext,
    request: Omit<HttpRequest, 'baseUrl' | 'timeoutMs' | 'headers' | 'signal'> & {
      timeoutMs?: number
    },
  ): Promise<HttpResponse<T>> {
    const response = await this.http.request<T>({
      ...request,
      baseUrl: context.line.baseUrl,
      headers: { 'X-Emby-Token': context.accessToken },
      ...(context.signal ? { signal: context.signal } : {}),
      timeoutMs: request.timeoutMs ?? 10_000,
    })
    if (response.status === 401 || response.status === 403) {
      throw new AppError('AuthenticationExpired', 'Server credential was rejected')
    }
    if (response.status >= 400) {
      throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
    }
    return response
  }
}
