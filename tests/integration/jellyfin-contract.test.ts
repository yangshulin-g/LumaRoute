import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  controlledPublicSample,
  createJellyfinAdapter,
  isContainerRuntimeAvailable,
  randomPassword,
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

describe.skipIf(!dockerAvailable)('live Jellyfin contract', () => {
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

  it('authenticates, browses, searches, and reports progress to temporary Jellyfin', async () => {
    const session = await adapter.authenticate(jellyfin.loginInput())
    const context = jellyfin.context(session)
    expect(await adapter.getLibraries(context)).toHaveLength(1)
    const items = await adapter.getItems(firstPage, context)
    expect(items.items).not.toHaveLength(0)
    const firstId = items.items[0]!.id
    startedReport.itemId = firstId
    stoppedReport.itemId = firstId
    expect((await adapter.search(searchQuery, context)).items).not.toHaveLength(0)
    await expect(adapter.reportPlayback(startedReport, context)).resolves.toBeUndefined()
    await expect(adapter.reportPlayback(stoppedReport, context)).resolves.toBeUndefined()
  })
})

describe.runIf(!dockerAvailable)('live Jellyfin contract (environment gate)', () => {
  it('records Docker runtime as unavailable for this host', () => {
    expect(dockerAvailable).toBe(false)
  })
})
