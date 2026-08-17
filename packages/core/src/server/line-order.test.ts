import { describe, expect, it } from 'vitest'
import { orderLines } from './line-order'
import type { ServerProfile } from './types'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'jellyfin',
  serverId: 'server-a',
  userId: 'user-a',
  username: 'alice',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'preferred',
  lines: [
    { id: 'preferred', label: 'LAN', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
    { id: 'backup-1', label: 'WAN', baseUrl: 'https://wan.example', priority: 1, enabled: true },
    { id: 'backup-2', label: 'Alt', baseUrl: 'https://alt.example', priority: 2, enabled: true },
    { id: 'disabled', label: 'Off', baseUrl: 'https://off.example', priority: 0, enabled: false },
  ],
}

describe('orderLines', () => {
  it('orders sticky, preferred, then remaining enabled lines by priority', () => {
    expect(orderLines(profile, 'backup-2').map((line) => line.id)).toEqual([
      'backup-2',
      'preferred',
      'backup-1',
    ])
  })
})
