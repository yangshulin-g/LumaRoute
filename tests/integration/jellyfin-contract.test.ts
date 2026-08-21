import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  JELLYFIN_IMAGE,
  controlledPublicSample,
  createJellyfinAdapter,
  isContainerRuntimeAvailable,
  randomPassword,
  requireContainerRuntime,
  resolveJellyfinImage,
  startJellyfinContainer,
  type JellyfinHarness,
} from './support/jellyfin-container'

const firstPage = { startIndex: 0, limit: 20 }
const searchQuery = { term: 'sample', startIndex: 0, limit: 20 }

const startedReport = {
  type: 'started' as const,
  itemId: '',
  mediaSourceId: 'source-1',
  playSessionId: 'session-1',
  positionTicks: 0,
  isPaused: false,
}

const stoppedReport = {
  type: 'stopped' as const,
  itemId: '',
  mediaSourceId: 'source-1',
  playSessionId: 'session-1',
  positionTicks: 10_000_000,
  isPaused: false,
}

const dockerAvailable = await isContainerRuntimeAvailable()

it('pins Jellyfin to the reviewed immutable manifest digest', () => {
  expect(JELLYFIN_IMAGE).toBe(
    'jellyfin/jellyfin@sha256:7ae36aab93ef9b6aaff02b37f8bb23df84bb2d7a3f6054ec8fc466072a648ce2',
  )
})

it('fails closed when CI requires a container runtime', () => {
  if (dockerAvailable) return
  vi.stubEnv('LUMAROUTE_REQUIRE_CONTAINER', '1')
  try {
    expect(() => requireContainerRuntime(false)).toThrow(/container runtime is required/i)
  } finally {
    vi.unstubAllEnvs()
  }
})

it('rejects a mutable tag override for LUMAROUTE_JELLYFIN_IMAGE', async () => {
  vi.stubEnv('LUMAROUTE_JELLYFIN_IMAGE', 'jellyfin/jellyfin:10.10.7')
  try {
    await expect(resolveJellyfinImage()).rejects.toThrow(/immutable sha256 digest/i)
  } finally {
    vi.unstubAllEnvs()
  }
})

const containerReady = requireContainerRuntime(dockerAvailable)

describe.skipIf(!containerReady)('live Jellyfin contract', () => {
  let jellyfin: JellyfinHarness
  const adapter = createJellyfinAdapter()

  beforeAll(async () => {
    jellyfin = await startJellyfinContainer()
    await jellyfin.completeStartupWizard({
      username: 'lumaroute-test',
      password: randomPassword(),
      mediaFixture: controlledPublicSample(),
    })
  }, 240_000)

  afterAll(async () => {
    await jellyfin?.stop()
  })

  it('authenticates, browses, searches, plans playback, and reports progress', async () => {
    const session = await adapter.authenticate(jellyfin.loginInput())
    const context = jellyfin.context(session)
    const libraries = await adapter.getLibraries(context)
    expect(libraries).toHaveLength(1)
    const items = await adapter.getItems({ ...firstPage, libraryId: libraries[0]!.id }, context)
    expect(items.items).not.toHaveLength(0)
    const itemId = items.items[0]!.id
    expect((await adapter.search(searchQuery, context)).items).not.toHaveLength(0)
    const playbackPlan = await adapter.getPlaybackPlan(itemId, context)
    expect(playbackPlan.itemId).toBe(itemId)
    expect(playbackPlan.method).toMatch(/^direct-(play|stream)$/)
    await expect(adapter.reportPlayback({ ...startedReport, itemId }, context)).resolves.toBeUndefined()
    await expect(adapter.reportPlayback({ ...stoppedReport, itemId }, context)).resolves.toBeUndefined()
  })
})

describe.runIf(!containerReady)('live Jellyfin contract (environment gate)', () => {
  it('records Docker runtime as unavailable for this host', () => {
    expect(dockerAvailable).toBe(false)
  })
})
