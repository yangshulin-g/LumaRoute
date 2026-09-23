import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ServerProfile } from '@lumaroute/core'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import { useServerStore } from '../stores/server-store'
import { settingsProps } from './index'

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
    { id: 'line-2', label: 'WAN', baseUrl: 'https://wan.example', priority: 1, enabled: true },
  ],
}

describe('settingsProps', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useServerStore().profiles = [profile]
    useAppStore().activeServerId = 'profile-1'
  })

  it('passes the session line from the media store', () => {
    useMediaStore().activeLineId = 'line-2'
    expect(settingsProps().activeLineId).toBe('line-2')
  })

  it('does not fall back to the preferred line without a session line', () => {
    useMediaStore().activeLineId = null
    expect(settingsProps().activeLineId).toBeNull()
  })

  it('ignores a session line that belongs to another profile', () => {
    useMediaStore().activeLineId = 'line-9'
    expect(settingsProps().activeLineId).toBeNull()
  })
})
