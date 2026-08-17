export type ServerKind = 'emby' | 'jellyfin'

export interface ServerLine {
  id: string
  label: string
  baseUrl: string
  priority: number
  enabled: boolean
}

export interface ServerProfile {
  id: string
  name: string
  kind: ServerKind
  serverId: string
  userId: string
  username: string
  credentialKey: string
  preferredLineId: string
  lines: ServerLine[]
}

export interface AppPreferences {
  deviceId: string | null
  activeServerId: string | null
  activeLibraryIdByServer: Readonly<Record<string, string>>
  sensitiveLineIds: readonly string[]
}
