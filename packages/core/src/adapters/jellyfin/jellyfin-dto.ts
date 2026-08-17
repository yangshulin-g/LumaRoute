export interface PublicSystemInfoDto {
  Id: string
  ServerName: string
}

export interface AuthenticateResponseDto {
  AccessToken: string
  ServerId: string
  User: {
    Id: string
    Name: string
  }
}

export interface JellyfinVirtualFolderDto {
  Name: string
  ItemId: string
  CollectionType?: string | null
}

export interface JellyfinItemDto {
  Id: string
  Name: string
  Type: string
  Overview?: string | null
  ProductionYear?: number | null
  RunTimeTicks?: number | null
  ParentId?: string | null
  SeriesId?: string | null
  IndexNumber?: number | null
  ImageTags?: {
    Primary?: string | null
  } | null
  UserData?: {
    PlaybackPositionTicks?: number | null
  } | null
}

export interface JellyfinItemsResultDto {
  Items: JellyfinItemDto[]
  TotalRecordCount: number
}

export interface JellyfinMediaStreamDto {
  Type: string
  Codec?: string | null
}

export interface JellyfinMediaSourceDto {
  Id: string
  Container: string
  SupportsDirectPlay: boolean
  SupportsDirectStream: boolean
  TranscodingUrl?: string | null
  Bitrate?: number | null
  RunTimeTicks?: number | null
  MediaStreams: JellyfinMediaStreamDto[]
}

export interface JellyfinPlaybackInfoDto {
  PlaySessionId: string
  MediaSources: JellyfinMediaSourceDto[]
}
