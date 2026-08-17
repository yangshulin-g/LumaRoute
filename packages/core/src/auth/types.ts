export interface LoginInput {
  baseUrl: string
  username: string
  password: string
  deviceId: string
  deviceName: 'LumaRoute'
  appVersion: string
  signal?: AbortSignal
}

export interface AuthSession {
  serverId: string
  serverName: string
  userId: string
  username: string
  accessToken: string
}
