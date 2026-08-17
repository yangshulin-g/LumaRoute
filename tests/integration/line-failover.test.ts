import { afterEach, describe, expect, it } from 'vitest'
import { createIntegrationApp } from './support/create-integration-app'
import { mockServer, type MockMediaServer } from './support/mock-media-server'

const firstPage = { startIndex: 0, limit: 20 }

describe('line failover', () => {
  const servers: MockMediaServer[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()))
  })

  it('uses backup for timeout and 503, but not for 401 or ServerId mismatch', async () => {
    const primary = await mockServer()
    const backup = await mockServer()
    servers.push(primary, backup)

    const app = await createIntegrationApp({
      lines: [primary.line('primary', 0), backup.line('backup', 1)],
    })

    // Adapter default timeout is 10s; delay past that so RouteExecutor sees LineTimeout.
    primary.reply('/Users/u/Items', { delayMs: 12_000 })
    backup.reply('/Users/u/Items', { status: 200, fixture: 'jellyfin/items.json' })
    await expect(app.media.getItems('profile-1', firstPage)).resolves.toMatchObject({
      lineId: 'backup',
    })

    app.routes.clearSession('profile-1')
    primary.reply('/Users/u/Items', { status: 503 })
    await expect(app.media.getItems('profile-1', firstPage)).resolves.toMatchObject({
      lineId: 'backup',
    })

    app.routes.clearSession('profile-1')
    primary.reply('/Users/u/Items', { status: 401 })
    await expect(app.media.getItems('profile-1', firstPage)).rejects.toMatchObject({
      code: 'AuthenticationExpired',
    })
    expect(backup.requests('/Users/u/Items')).toHaveLength(2)

    backup.reply('/System/Info', { status: 200, body: { Id: 'different-server', ServerName: 'Other' } })
    await expect(app.lines.addLine('profile-1', backup.line('mismatch', 2))).rejects.toMatchObject({
      code: 'ServerMismatch',
    })
  })
})
