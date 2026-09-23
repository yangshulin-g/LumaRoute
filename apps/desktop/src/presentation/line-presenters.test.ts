import { describe, expect, it } from 'vitest'
import type { ServerProfile } from '@lumaroute/core'
import { lineProtocol, lineStateLabels, resolveLine } from './line-presenters'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'emby',
  serverId: 'server-1',
  userId: 'user-1',
  username: 'demo',
  credentialKey: 'credential-1',
  preferredLineId: 'line-1',
  lines: [
    { id: 'line-1', label: 'LAN', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
    { id: 'line-2', label: 'WAN', baseUrl: 'https://media.example', priority: 1, enabled: false },
  ],
}

describe('line presenters', () => {
  it('does not substitute preferred line when an unknown active id is supplied', () => {
    expect(resolveLine(profile, 'missing')).toBeNull()
    expect(resolveLine(profile, null)).toBeNull()
  })

  it('derives only facts represented by ServerLine', () => {
    expect(lineProtocol(profile.lines[0]!)).toBe('HTTP')
    expect(lineProtocol(profile.lines[1]!)).toBe('HTTPS')
    expect(lineStateLabels(profile.lines[1]!, profile, 'line-2')).toEqual(['当前线路', '已禁用'])
  })
})
