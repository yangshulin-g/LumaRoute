import { createHash, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
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
  return `lr-${randomBytes(12).toString('base64url')}`
}

export function controlledFixtureDirectory(): string {
  return FIXTURE_DIR
}

export async function ensureControlledMediaFixture(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true })
  // Minimal ISO BMFF (ftyp) so Jellyfin may register a video item during library scan.
  const samplePath = path.join(FIXTURE_DIR, 'sample.mp4')
  const payload = Buffer.from([
    0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x08,
    0x66, 0x72, 0x65, 0x65,
  ])
  await writeFile(samplePath, payload)
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

    await fetchJson(`${base}/Startup/Configuration`, {
      method: 'POST',
      body: {
        UICulture: 'en-US',
        MetadataCountryCode: 'US',
        PreferredMetadataLanguage: 'en',
      },
    })
    await fetchJson(`${base}/Startup/User`, {
      method: 'POST',
      body: { Name: options.username, Password: options.password },
    })
    await fetchJson(`${base}/Startup/RemoteAccess`, {
      method: 'POST',
      body: { EnableRemoteAccess: false, EnableAutomaticPortMapping: false },
    })
    await fetchJson(`${base}/Startup/Complete`, { method: 'POST' })

    const auth = await fetchJson<{ AccessToken: string; User: { Id: string } }>(
      `${base}/Users/AuthenticateByName`,
      {
        method: 'POST',
        headers: {
          'X-Emby-Authorization':
            'MediaBrowser Client="LumaRoute", Device="LumaRoute", DeviceId="lumaroute-integration", Version="0.1.0"',
        },
        body: { Username: options.username, Pw: options.password },
      },
    )

    await fetchJson(
      `${base}/Library/VirtualFolders?name=Movies&collectionType=movies&refreshLibrary=true`,
      {
        method: 'POST',
        headers: { 'X-Emby-Token': auth.AccessToken },
        body: {
          LibraryOptions: {
            PathInfos: [{ Path: options.mediaFixture }],
            EnablePhotos: false,
          },
        },
      },
    )

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

export async function isContainerRuntimeAvailable(): Promise<boolean> {
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const execFileAsync = promisify(execFile)
    await execFileAsync('docker', ['info'], { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

export async function startJellyfinContainer(): Promise<JellyfinHarness> {
  await ensureControlledMediaFixture()
  const image = await resolveJellyfinImage()
  const container = await new GenericContainer(image)
    .withExposedPorts(8096)
    .withCopyDirectoriesToContainer([
      {
        source: controlledFixtureDirectory(),
        target: '/media',
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
  return '/media'
}

async function fetchJson<T = unknown>(
  url: string,
  init: {
    method?: string
    headers?: Record<string, string>
    body?: unknown
  } = {},
): Promise<T> {
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

async function waitForItems(base: string, token: string, userId: string): Promise<void> {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const result = await fetchJson<{ Items: unknown[]; TotalRecordCount: number }>(
      `${base}/Users/${userId}/Items?Recursive=true&IncludeItemTypes=Movie,Video&Limit=20`,
      { headers: { 'X-Emby-Token': token } },
    )
    if ((result.Items?.length ?? 0) > 0 || result.TotalRecordCount > 0) return
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error('Timed out waiting for Jellyfin library items')
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
