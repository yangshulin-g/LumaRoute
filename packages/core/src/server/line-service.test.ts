import { describe, expect, it, vi } from 'vitest'
import { LineService } from './line-service'
import type { ServerProfile } from './types'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'jellyfin',
  serverId: 'server-a',
  userId: 'user-a',
  username: 'alice',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'line-1',
  lines: [
    { id: 'line-1', label: 'LAN', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
  ],
}

describe('LineService', () => {
  it('rejects a line that belongs to another logical server', async () => {
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(profile),
      saveServerProfile: vi.fn(),
    }
    const credentials = { get: vi.fn().mockResolvedValue('token-a') }
    const probe = {
      getServerIdentity: vi.fn().mockResolvedValue({ serverId: 'other-server', serverName: 'Other' }),
    }
    const service = new LineService(storage as never, credentials as never, probe)

    await expect(
      service.addLine('profile-1', {
        id: 'line-2',
        label: 'WAN',
        baseUrl: 'https://wan.example',
        priority: 1,
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: 'ServerMismatch' })
    expect(storage.saveServerProfile).not.toHaveBeenCalled()
  })

  it('persists a matching line after identity probe', async () => {
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(profile),
      saveServerProfile: vi.fn(),
    }
    const credentials = { get: vi.fn().mockResolvedValue('token-a') }
    const probe = {
      getServerIdentity: vi.fn().mockResolvedValue({ serverId: 'server-a', serverName: 'Home' }),
    }
    const service = new LineService(storage as never, credentials as never, probe)
    const draft = {
      id: 'line-2',
      label: 'WAN',
      baseUrl: 'https://wan.example',
      priority: 1,
      enabled: true,
    }

    const updated = await service.addLine('profile-1', draft)

    expect(probe.getServerIdentity).toHaveBeenCalledWith(
      'jellyfin',
      'https://wan.example',
      'token-a',
      undefined,
    )
    expect(storage.saveServerProfile).toHaveBeenCalledWith({
      ...profile,
      lines: [...profile.lines, draft],
    })
    expect(updated.lines).toHaveLength(2)
  })
})
