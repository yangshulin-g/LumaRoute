import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import { JellyfinAdapter, type AuthSession, type LoginInput } from '@lumaroute/core'
import { NodeHttpTransport } from './memory-ports'

export const JELLYFIN_IMAGE =
  'jellyfin/jellyfin@sha256:7ae36aab93ef9b6aaff02b37f8bb23df84bb2d7a3f6054ec8fc466072a648ce2'

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/media/controlled',
)

export function randomPassword(): string {
  return `Lr1-${randomBytes(12).toString('base64url')}`
}

export function controlledFixtureDirectory(): string {
  return FIXTURE_DIR
}

export async function ensureControlledMediaFixture(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true })
  const samplePath = path.join(FIXTURE_DIR, 'sample.mp4')
  const bytes = await readFile(samplePath)
  const boxes = ['ftyp', 'moov', 'mdat']
  if (bytes.byteLength < 1000 || boxes.some((box) => !bytes.includes(Buffer.from(box)))) {
    throw new Error('controlled media fixture must be a scannable MP4 with ftyp, moov, and mdat')
  }
}

type WizardOptions = {
  username: string
  password: string
  mediaFixture: string
}

export class JellyfinHarness {
  private username = ''
  private password = ''

  constructor(private readonly container: StartedTestContainer) {}

  baseUrl(): string {
    return `http://127.0.0.1:${this.container.getMappedPort(8096)}`
  }

  loginInput(overrides: Partial<LoginInput> = {}): LoginInput {
    return {
      baseUrl: this.baseUrl(),
      username: this.username,
      password: this.password,
      deviceId: 'lumaroute-integration',
      deviceName: 'LumaRoute',
      appVersion: '0.1.0',
      ...overrides,
    }
  }

  context(session: AuthSession) {
    return {
      profileId: 'jellyfin-contract',
      line: {
        id: 'primary',
        label: 'Primary',
        baseUrl: this.baseUrl(),
        priority: 0,
        enabled: true,
      },
      userId: session.userId,
      accessToken: session.accessToken,
    }
  }

  async completeStartupWizard(options: WizardOptions): Promise<void> {
    this.username = options.username
    this.password = options.password
    const base = this.baseUrl()

    await fetchJsonWithRetry(`${base}/Startup/Configuration`, {
      method: 'POST',
      body: {
        UICulture: 'en-US',
        MetadataCountryCode: 'US',
        PreferredMetadataLanguage: 'en',
      },
    })
    const startupUser = await configureStartupUser(base, options)
    this.username = startupUser.username
    await fetchJsonWithRetry(`${base}/Startup/RemoteAccess`, {
      method: 'POST',
      body: { EnableRemoteAccess: false, EnableAutomaticPortMapping: false },
    })
    await fetchJsonWithRetry(`${base}/Startup/Complete`, { method: 'POST' })

    let auth = await authenticateAfterWizard(base, startupUser)
    if (!startupUser.passwordSet) {
      await setUserPassword(base, auth, options.password)
      auth = await authenticateByName(base, startupUser.username, options.password)
    }
    this.password = options.password

    await fetchJson(
      `${base}/Library/VirtualFolders?name=Movies&collectionType=movies&refreshLibrary=true`,
      {
        method: 'POST',
        headers: { 'X-Emby-Token': auth.AccessToken },
        body: {
          LibraryOptions: libraryOptionsForFixture(options.mediaFixture),
        },
      },
    )
    await fetchJson(`${base}/Library/Refresh`, {
      method: 'POST',
      headers: { 'X-Emby-Token': auth.AccessToken },
    })
    const folders = await fetchJson<Array<{ Name?: string }>>(
      `${base}/Library/VirtualFolders`,
      { headers: { 'X-Emby-Token': auth.AccessToken } },
    )
    if (!Array.isArray(folders) || !folders.some((folder) => folder.Name === 'Movies')) {
      throw new Error('Jellyfin Movies library was not created')
    }

    await waitForItems(base, auth.AccessToken, auth.User.Id)
  }

  async stop(): Promise<void> {
    this.password = ''
    await this.container.stop()
  }
}

export function requireContainerRuntime(available: boolean): boolean {
  if (!available && process.env.LUMAROUTE_REQUIRE_CONTAINER === '1') {
    throw new Error('Jellyfin container runtime is required but unavailable')
  }
  return available
}

export async function resolveJellyfinImage(): Promise<string> {
  const override = process.env.LUMAROUTE_JELLYFIN_IMAGE
  if (override && !/@sha256:[0-9a-f]{64}$/.test(override)) {
    throw new Error('LUMAROUTE_JELLYFIN_IMAGE must use an immutable sha256 digest')
  }
  return override ?? JELLYFIN_IMAGE
}

async function defaultDockerProbe(): Promise<void> {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)
  await execFileAsync('docker', ['info'], { timeout: 15_000 })
}

export async function probeContainerRuntime(options: {
  probe?: () => Promise<void>
  attempts?: number
  delayMs?: number
  platform?: NodeJS.Platform
} = {}): Promise<boolean> {
  const platform = options.platform ?? process.platform
  if (platform === 'win32') return false
  const probe = options.probe ?? defaultDockerProbe
  const attempts = Math.max(1, options.attempts ?? 5)
  const delayMs = options.delayMs ?? 400
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await probe()
      return true
    } catch {
      if (attempt === attempts) return false
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }
  return false
}

export async function isContainerRuntimeAvailable(): Promise<boolean> {
  return probeContainerRuntime()
}

export async function startJellyfinContainer(): Promise<JellyfinHarness> {
  await ensureControlledMediaFixture()
  const image = await resolveJellyfinImage()
  const container = await new GenericContainer(image)
    .withExposedPorts(8096)
    .withCopyDirectoriesToContainer([
      {
        source: controlledFixtureDirectory(),
        target: controlledPublicSample(),
      },
    ])
    .withWaitStrategy(Wait.forHttp('/System/Info/Public', 8096).forStatusCode(200))
    .withStartupTimeout(180_000)
    .start()
  return new JellyfinHarness(container)
}

export function createJellyfinAdapter(): JellyfinAdapter {
  return new JellyfinAdapter(new NodeHttpTransport())
}

export function controlledPublicSample(): string {
  return '/data/lumaroute-media'
}

export function libraryOptionsForFixture(mediaPath: string) {
  return {
    PathInfos: [{ Path: mediaPath }],
    EnablePhotos: false,
    EnableInternetProviders: false,
    SaveLocalMetadata: false,
    EnableRealtimeMonitor: false,
  }
}

type FetchJsonInit = {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  attempts?: number
  retryDelayMs?: number
}

async function fetchJsonOnce<T>(url: string, init: FetchJsonInit): Promise<T> {
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Jellyfin harness HTTP ${response.status}: ${redactSecrets(text)}`)
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

async function fetchJson<T = unknown>(url: string, init: FetchJsonInit = {}): Promise<T> {
  const attempts = Math.max(1, init.attempts ?? 1)
  const retryDelayMs = init.retryDelayMs ?? 500
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJsonOnce<T>(url, init)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const retryable = /HTTP 5\d\d/.test(lastError.message)
      if (!retryable || attempt === attempts) throw lastError
      if (retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      }
    }
  }
  throw lastError ?? new Error('Jellyfin harness request failed')
}

export async function fetchJsonWithRetry<T = unknown>(
  url: string,
  init: FetchJsonInit = {},
): Promise<T> {
  return fetchJson<T>(url, { attempts: 8, retryDelayMs: 500, ...init })
}

const EMBY_AUTHORIZATION =
  'MediaBrowser Client="LumaRoute", Device="LumaRoute", DeviceId="lumaroute-integration", Version="0.1.0"'

type StartupUserConfig = {
  username: string
  password: string
  passwordSet: boolean
}

export async function configureStartupUser(
  baseUrl: string,
  options: { username: string; password: string },
): Promise<StartupUserConfig> {
  const current = await fetchJsonWithRetry<{ Name?: string }>(`${baseUrl}/Startup/User`)
  const placeholder = current.Name?.trim() || 'jellyfin'
  try {
    await fetchJsonWithRetry(`${baseUrl}/Startup/User`, {
      method: 'POST',
      body: { Name: options.username, Password: options.password },
      attempts: 1,
    })
    return {
      username: options.username,
      password: options.password,
      passwordSet: true,
    }
  } catch (error) {
    if (error instanceof Error && /HTTP 500/.test(error.message)) {
      return {
        username: placeholder,
        password: options.password,
        passwordSet: false,
      }
    }
    throw error
  }
}

async function authenticateByName(
  baseUrl: string,
  username: string,
  password: string,
): Promise<{ AccessToken: string; User: { Id: string } }> {
  return fetchJson(`${baseUrl}/Users/AuthenticateByName`, {
    method: 'POST',
    headers: { 'X-Emby-Authorization': EMBY_AUTHORIZATION },
    body: { Username: username, Pw: password },
  })
}

async function authenticateAfterWizard(
  baseUrl: string,
  startupUser: StartupUserConfig,
): Promise<{ AccessToken: string; User: { Id: string } }> {
  try {
    return await authenticateByName(baseUrl, startupUser.username, startupUser.password)
  } catch (error) {
    if (startupUser.passwordSet) throw error
    return authenticateByName(baseUrl, startupUser.username, '')
  }
}

async function setUserPassword(
  baseUrl: string,
  auth: { AccessToken: string; User: { Id: string } },
  password: string,
): Promise<void> {
  await fetchJson(`${baseUrl}/Users/${auth.User.Id}/Password`, {
    method: 'POST',
    headers: { 'X-Emby-Token': auth.AccessToken },
    body: { CurrentPw: '', NewPw: password },
  })
}

async function waitForItems(base: string, token: string, userId: string): Promise<void> {
  const deadline = Date.now() + 120_000
  let lastOverview = 'none'
  while (Date.now() < deadline) {
    const movies = await fetchJson<{ Items: { Type?: string }[]; TotalRecordCount: number }>(
      `${base}/Users/${userId}/Items?Recursive=true&IncludeItemTypes=Movie,Video&Limit=20`,
      { headers: { 'X-Emby-Token': token } },
    )
    if ((movies.Items?.length ?? 0) > 0 || movies.TotalRecordCount > 0) return
    const all = await fetchJson<{ Items: { Type?: string }[]; TotalRecordCount: number }>(
      `${base}/Users/${userId}/Items?Recursive=true&Limit=50`,
      { headers: { 'X-Emby-Token': token } },
    )
    const types = (all.Items ?? []).map((item) => item.Type ?? 'unknown').join(',') || 'none'
    lastOverview = `count=${all.TotalRecordCount ?? 0} types=${types}`
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error(`Timed out waiting for Jellyfin library items (${lastOverview})`)
}

function redactSecrets(value: string): string {
  return value
    .replace(/("AccessToken"\s*:\s*")[^"]+/gi, '$1[redacted]')
    .replace(/("Password"\s*:\s*")[^"]+/gi, '$1[redacted]')
    .replace(/(X-Emby-Token:\s*)\S+/gi, '$1[redacted]')
}

export function fingerprintPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex').slice(0, 12)
}
