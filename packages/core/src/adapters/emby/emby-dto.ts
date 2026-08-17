export interface EmbyPublicSystemInfoDto {
  Id: string
  ServerName: string
}

export interface EmbyAuthenticateResponseDto {
  AccessToken: string
  ServerId: string
  User: {
    Id: string
    Name: string
  }
}

export interface EmbyVirtualFolderDto {
  Name: string
  ItemId: string
  CollectionType?: string | null
}

export interface EmbyItemDto {
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

export interface EmbyItemsResultDto {
  Items: EmbyItemDto[]
  TotalRecordCount: number
}

export interface EmbyMediaStreamDto {
  Type: string
  Codec?: string | null
}

export interface EmbyMediaSourceDto {
  Id: string
  Container: string
  SupportsDirectPlay: boolean
  SupportsDirectStream: boolean
  TranscodingUrl?: string | null
  Bitrate?: number | null
  RunTimeTicks?: number | null
  MediaStreams: EmbyMediaStreamDto[]
}

export interface EmbyPlaybackInfoDto {
  PlaySessionId: string
  MediaSources: EmbyMediaSourceDto[]
}
