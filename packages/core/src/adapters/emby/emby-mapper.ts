import { AppError } from '../../errors/app-error'
import type { AuthSession } from '../../auth/types'
import type { Library, MediaItem, MediaKind, RequestContext } from '../../media/types'
import type { PlaybackPlan } from '@lumaroute/player'
import type {
  EmbyAuthenticateResponseDto,
  EmbyItemDto,
  EmbyPlaybackInfoDto,
  EmbyPublicSystemInfoDto,
  EmbyVirtualFolderDto,
} from './emby-dto'

const CREDENTIAL_QUERY_KEYS = new Set(['api_key', 'token', 'x-emby-token'])

export function stripCredentialQuery(url: string): string {
  const [pathAndMaybeQuery, ...hashParts] = url.split('#')
  const hash = hashParts.length > 0 ? `#${hashParts.join('#')}` : ''
  const [path, query = ''] = (pathAndMaybeQuery ?? '').split('?')
  if (!query) return `${path ?? ''}${hash}`
  const kept = query
    .split('&')
    .filter((part) => {
      const key = part.split('=')[0]?.trim().toLowerCase()
      return key != null && key.length > 0 && !CREDENTIAL_QUERY_KEYS.has(key)
    })
    .join('&')
  return kept.length > 0 ? `${path ?? ''}?${kept}${hash}` : `${path ?? ''}${hash}`
}

export function selectPlaybackPlan(
  itemId: string,
  dto: EmbyPlaybackInfoDto,
  context: RequestContext,
): PlaybackPlan {
  const source =
    dto.MediaSources.find((candidate) => candidate.SupportsDirectPlay) ??
    dto.MediaSources.find(
      (candidate) =>
        candidate.SupportsDirectStream &&
        candidate.TranscodingUrl != null &&
        candidate.TranscodingUrl.includes('VideoCodec=copy') &&
        candidate.TranscodingUrl.includes('AudioCodec=copy'),
    )
  if (!source) {
    throw new AppError('MediaNotDirectPlayable', 'The server requires video or audio transcoding')
  }
  const direct = source.SupportsDirectPlay
  const relativeUrl = direct
    ? `/Videos/${itemId}/stream.${source.Container}?Static=true&MediaSourceId=${encodeURIComponent(source.Id)}`
    : stripCredentialQuery(source.TranscodingUrl!)
  return {
    itemId,
    mediaSourceId: source.Id,
    playSessionId: dto.PlaySessionId,
    streamUrl: `${context.line.baseUrl.replace(/\/+$/, '')}/${relativeUrl.replace(/^\/+/, '')}`,
    requestHeaders: { 'X-Emby-Token': context.accessToken },
    container: source.Container,
    videoCodec: source.MediaStreams.find((stream) => stream.Type === 'Video')?.Codec ?? 'unknown',
    audioCodec: source.MediaStreams.find((stream) => stream.Type === 'Audio')?.Codec ?? null,
    bitrate: source.Bitrate ?? null,
    durationSeconds: (source.RunTimeTicks ?? 0) / 10_000_000,
    method: direct ? 'direct-play' : 'direct-stream',
    startPositionSeconds: 0,
  }
}

export function mapEmbyAuthSession(
  info: EmbyPublicSystemInfoDto,
  auth: EmbyAuthenticateResponseDto,
): AuthSession {
  return {
    serverId: auth.ServerId,
    serverName: info.ServerName,
    userId: auth.User.Id,
    username: auth.User.Name,
    accessToken: auth.AccessToken,
  }
}

export function mapLibrary(dto: EmbyVirtualFolderDto): Library {
  return {
    id: dto.ItemId,
    name: dto.Name,
    collectionType: dto.CollectionType ?? null,
  }
}

export function mapKind(type: string): MediaKind {
  switch (type) {
    case 'Movie':
      return 'movie'
    case 'Series':
      return 'series'
    case 'Season':
      return 'season'
    case 'Episode':
      return 'episode'
    default:
      return 'movie'
  }
}

export function toProviderKind(kind: MediaKind): string {
  switch (kind) {
    case 'movie':
      return 'Movie'
    case 'series':
      return 'Series'
    case 'season':
      return 'Season'
    case 'episode':
      return 'Episode'
  }
}

export function mapItem(dto: EmbyItemDto): MediaItem {
  return {
    id: dto.Id,
    kind: mapKind(dto.Type),
    name: dto.Name,
    overview: dto.Overview ?? null,
    productionYear: dto.ProductionYear ?? null,
    runtimeSeconds: dto.RunTimeTicks == null ? null : dto.RunTimeTicks / 10_000_000,
    parentId: dto.ParentId ?? null,
    seriesId: dto.SeriesId ?? null,
    indexNumber: dto.IndexNumber ?? null,
    imageTag: dto.ImageTags?.Primary ?? null,
    playbackPositionSeconds: (dto.UserData?.PlaybackPositionTicks ?? 0) / 10_000_000,
  }
}
