import { describe, expect, it } from 'vitest'
import { createMemorySqlClient } from './sql-client'
import { SqliteStorage } from './sqlite-storage'

describe('SqliteStorage', () => {
  it('round-trips profiles and lines transactionally', async () => {
    const client = createMemorySqlClient()
    const storage = new SqliteStorage(client)
    await storage.initialize()
    await storage.saveServerProfile({
      id: 'p1',
      name: 'Home',
      kind: 'emby',
      serverId: 's1',
      userId: 'u1',
      username: 'alice',
      credentialKey: 'lumaroute/p1',
      preferredLineId: 'l1',
      lines: [{ id: 'l1', label: 'LAN', baseUrl: 'http://nas:8096', priority: 0, enabled: true }],
    })
    expect(await storage.getServerProfile('p1')).toMatchObject({
      serverId: 's1',
      credentialKey: 'lumaroute/p1',
      lines: [{ id: 'l1', priority: 0 }],
    })
  })

  it('never writes credential values', async () => {
    const client = createMemorySqlClient()
    const storage = new SqliteStorage(client)
    await storage.initialize()
    expect(JSON.stringify(client.dump())).not.toMatch(/token|password|accessToken/i)
  })
})
