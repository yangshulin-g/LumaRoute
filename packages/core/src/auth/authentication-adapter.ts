import type { AuthSession, LoginInput } from './types'

export type { AuthSession, LoginInput }

export interface AuthenticationAdapter {
  authenticate(input: LoginInput): Promise<AuthSession>
  getServerIdentity(
    baseUrl: string,
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<{ serverId: string; serverName: string }>
}
