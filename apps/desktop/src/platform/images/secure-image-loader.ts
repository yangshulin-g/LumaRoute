import { AppError, type CredentialStore, type HttpTransport, type RouteExecutor, type StoragePort } from '@lumaroute/core'

export class SecureImageLoader {
  constructor(
    private readonly storage: StoragePort,
    private readonly credentials: CredentialStore,
    private readonly routes: RouteExecutor,
    private readonly http: HttpTransport,
  ) {}

  async load(
    profileId: string,
    itemId: string,
    imageTag: string | null,
    signal?: AbortSignal,
  ): Promise<string> {
    const profile = await this.storage.getServerProfile(profileId)
    if (!profile) throw new AppError('StorageFailure', 'Server profile was not found')
    const token = await this.credentials.get(profile.credentialKey)
    if (!token) throw new AppError('AuthenticationExpired', 'Server credential is unavailable')
    const { value } = await this.routes.execute(
      profile,
      async (line) => {
        const response = await this.http.request<Uint8Array>({
          baseUrl: line.baseUrl,
          path: `/Items/${encodeURIComponent(itemId)}/Images/Primary`,
          method: 'GET',
          query: { tag: imageTag ?? undefined, maxWidth: 400 },
          headers: { 'X-Emby-Token': token },
          ...(signal ? { signal } : {}),
          timeoutMs: 10_000,
          responseType: 'bytes',
        })
        if (response.status >= 400) {
          throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status })
        }
        return response.data
      },
      signal,
    )
    return URL.createObjectURL(new Blob([Uint8Array.from(value)]))
  }

  release(url: string): void {
    URL.revokeObjectURL(url)
  }
}
