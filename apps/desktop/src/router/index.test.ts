import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'
import type { ServerProfile } from '@lumaroute/core'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import { useServerStore } from '../stores/server-store'
import { createAppRouter, onboardingProps, settingsProps } from './index'

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

  it('does not fabricate a placeholder profile when no server exists', () => {
    useServerStore().profiles = []
    useAppStore().activeServerId = null
    expect(settingsProps().profile).toBeNull()
  })

  it('opens the account form only when routed with reauth=1', () => {
    expect(settingsProps().reauthOpen).toBe(false)
    expect(settingsProps({ query: { reauth: '1' } }).reauthOpen).toBe(true)
  })

  it('delegates re-authentication to the server store', async () => {
    const store = useServerStore()
    const reauthenticate = vi.spyOn(store, 'reauthenticate').mockResolvedValue(undefined)
    await settingsProps().reauthenticate('profile-1', 'new-password')
    expect(reauthenticate).toHaveBeenCalledWith('profile-1', 'new-password')
  })
})

describe('createAppRouter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('redirects every shell route to onboarding while no server exists', async () => {
    useServerStore().profiles = []
    const router = createAppRouter()
    await router.push('/settings')
    expect(router.currentRoute.value.name).toBe('onboarding')
    await router.push('/search?q=Arrival')
    expect(router.currentRoute.value.name).toBe('onboarding')
  })

  it('keeps shell routes reachable once a server exists', async () => {
    useServerStore().profiles = [profile]
    const router = createAppRouter()
    await router.push('/search')
    expect(router.currentRoute.value.name).toBe('search')
  })
})

describe('onboardingProps', () => {
  function fakeRouter(back: string | null) {
    return {
      replace: vi.fn().mockResolvedValue(undefined),
      back: vi.fn(),
      options: { history: { state: { back } } },
    } as unknown as Router
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    useServerStore().profiles = [profile]
  })

  it('offers cancel in add mode and returns to the previous page', () => {
    const router = fakeRouter('/settings')
    const props = onboardingProps({ query: { mode: 'add' } }, router)
    expect(props.mode).toBe('add')
    props.cancel?.()
    expect(router.back).toHaveBeenCalledOnce()
  })

  it('falls back to home when add mode has no in-app history', () => {
    const router = fakeRouter(null)
    onboardingProps({ query: { mode: 'add' } }, router).cancel?.()
    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith({ name: 'home' })
  })

  it('hides cancel on first launch even if mode=add is requested', () => {
    useServerStore().profiles = []
    const props = onboardingProps({ query: { mode: 'add' } }, fakeRouter('/'))
    expect(props.mode).toBe('first')
    expect(props.cancel).toBeUndefined()
  })

  it('lands on home after the new server is saved', async () => {
    const router = fakeRouter(null)
    const store = useServerStore()
    const addServer = vi
      .spyOn(store, 'addServer')
      .mockResolvedValue({ serverName: 'Office', serverId: 'server-b', id: 'profile-2' })
    const input = {
      name: 'Office',
      kind: 'jellyfin' as const,
      baseUrl: 'https://office.example',
      username: 'alice',
      password: 'secret',
    }
    await onboardingProps({ query: { mode: 'add' } }, router).addServer(input)
    expect(addServer).toHaveBeenCalledWith(input)
    expect(router.replace).toHaveBeenCalledWith({ name: 'home' })
  })
})
