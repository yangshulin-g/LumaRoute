import {
  AppError,
  type AppPreferences,
  type CredentialStore,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
  type ServerProfile,
  type StoragePort,
} from '@lumaroute/core'

const DEFAULT_PREFERENCES: AppPreferences = {
  deviceId: null,
  activeServerId: null,
  activeLibraryIdByServer: {},
  sensitiveLineIds: [],
}

export class MemoryStorage implements StoragePort {
  private profiles = new Map<string, ServerProfile>()
  private order: string[] = []
  private preferences: AppPreferences = { ...DEFAULT_PREFERENCES, activeLibraryIdByServer: {} }

  async initialize(): Promise<void> {}

  async listServerProfiles(): Promise<readonly ServerProfile[]> {
    return this.order
      .map((id) => this.profiles.get(id))
      .filter((profile): profile is ServerProfile => profile !== undefined)
      .map((profile) => structuredClone(profile))
  }

  async getServerProfile(profileId: string): Promise<ServerProfile | null> {
    const profile = this.profiles.get(profileId)
    return profile ? structuredClone(profile) : null
  }

  async saveServerProfile(profile: ServerProfile): Promise<void> {
    if (!this.profiles.has(profile.id)) this.order.push(profile.id)
    this.profiles.set(profile.id, structuredClone(profile))
  }

  async deleteServerProfile(profileId: string): Promise<void> {
    this.profiles.delete(profileId)
    this.order = this.order.filter((id) => id !== profileId)
  }

  async reorderServerProfiles(profileIds: readonly string[]): Promise<void> {
    this.order = [...profileIds]
  }

  async loadPreferences(): Promise<AppPreferences> {
    return {
      ...this.preferences,
      activeLibraryIdByServer: { ...this.preferences.activeLibraryIdByServer },
      sensitiveLineIds: [...this.preferences.sensitiveLineIds],
    }
  }

  async savePreferences(preferences: AppPreferences): Promise<void> {
    this.preferences = {
      ...preferences,
      activeLibraryIdByServer: { ...preferences.activeLibraryIdByServer },
      sensitiveLineIds: [...preferences.sensitiveLineIds],
    }
  }
}

export class MemoryCredentialStore implements CredentialStore {
  private readonly values = new Map<string, string>()

  async set(credentialKey: string, token: string): Promise<void> {
    this.values.set(credentialKey, token)
  }

  async get(credentialKey: string): Promise<string | null> {
    return this.values.get(credentialKey) ?? null
  }

  async delete(credentialKey: string): Promise<void> {
    this.values.delete(credentialKey)
  }
}

function buildUrl(request: HttpRequest): URL {
  const url = new URL(
    `${request.baseUrl.replace(/\/+$/, '')}/${request.path.replace(/^\/+/, '')}`,
  )
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true
  return /aborted|timeout/i.test(error.message)
}

export class NodeHttpTransport implements HttpTransport {
  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const url = buildUrl(request)
    const init: RequestInit = {
      method: request.method,
      redirect: 'manual',
      signal: AbortSignal.any([
        request.signal ?? new AbortController().signal,
        AbortSignal.timeout(request.timeoutMs),
      ]),
    }
    if (request.headers) init.headers = { ...request.headers }
    if (request.body !== undefined) init.body = JSON.stringify(request.body)

    let response: Response
    try {
      response = await fetch(url, init)
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new AppError('LineTimeout', 'Request timed out', error)
      }
      throw new AppError('NetworkUnavailable', 'Network request failed', error)
    }

    if (response.status >= 300 && response.status < 400) {
      throw new AppError('NetworkUnavailable', 'Cross-origin redirects are disabled')
    }

    const headers = Object.fromEntries(response.headers.entries())
    if (response.status === 204) {
      return { status: response.status, headers, data: undefined as T }
    }
    if (request.responseType === 'bytes') {
      return {
        status: response.status,
        headers,
        data: new Uint8Array(await response.arrayBuffer()) as T,
      }
    }
    return {
      status: response.status,
      headers,
      data: (await response.json()) as T,
    }
  }
}
