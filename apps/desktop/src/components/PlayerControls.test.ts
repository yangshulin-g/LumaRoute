import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { ServerProfile } from '@lumaroute/core'
import { provideServices, servicesKey } from '../composition/inject-services'
import type { AppServices } from '../composition/service-types'
import PlayerControls from './PlayerControls.vue'
import { usePlayerStore } from '../stores/player-store'
import { useServerStore } from '../stores/server-store'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'emby',
  serverId: 'srv-1',
  userId: 'u-1',
  username: 'demo',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'line-2',
  lines: [
    { id: 'line-1', label: 'LAN', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
    { id: 'line-2', label: 'WAN', baseUrl: 'https://emby.example', priority: 1, enabled: true },
  ],
}

function mountPlaying(activeLineId: string | null): VueWrapper {
  const services = {
    player: {
      pause: vi.fn(),
      resume: vi.fn(),
      seek: vi.fn(),
      stop: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    },
    progressReporter: { handle: vi.fn() },
  } as unknown as AppServices
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  provideServices(app, services)
  setActivePinia(pinia)
  let wrapper!: VueWrapper
  app.runWithContext(() => {
    useServerStore().profiles = [profile]
    const store = usePlayerStore()
    store.state = 'playing'
    store.positionSeconds = 12
    store.durationSeconds = 120
    store.activeProfileId = profile.id
    store.activeLineId = activeLineId
    store.activePlan = {
      itemId: 'item-1',
      mediaSourceId: 'source-1',
      playSessionId: 'session-1',
      streamUrl: 'https://media.example/stream',
      requestHeaders: {},
      container: 'mkv',
      videoCodec: 'hevc',
      audioCodec: 'aac',
      bitrate: 8_000_000,
      durationSeconds: 120,
      method: 'direct-play',
      startPositionSeconds: 0,
    }
    wrapper = mount(PlayerControls, {
      global: {
        plugins: [pinia],
        provide: { [servicesKey as symbol]: services },
      },
    })
  })
  return wrapper
}

describe('PlayerControls', () => {
  it('shows active-plan facts but no unimplemented v0.2 controls', () => {
    const wrapper = mountPlaying('line-1')
    expect(wrapper.get('[data-testid="playback-facts"]').text()).toContain('8.0 Mbps')
    expect(wrapper.get('[data-testid="player-seek"]').attributes('max')).toBe('120')
    expect(wrapper.find('[data-testid="player-pause"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="player-stop"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="volume"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="audio-tracks"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="subtitles"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fullscreen"]').exists()).toBe(false)
  })

  it('labels the active playback line by name, never by raw id or preferred line', () => {
    const wrapper = mountPlaying('line-1')
    const line = wrapper.get('[data-testid="playback-line"]').text()
    expect(line).toBe('线路 LAN')
    expect(wrapper.text()).not.toContain('line-1')
    expect(wrapper.text()).not.toContain('WAN')
  })

  it('omits the line chip when the active line does not resolve', () => {
    const wrapper = mountPlaying('line-gone')
    expect(wrapper.find('[data-testid="playback-line"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('line-gone')
    expect(wrapper.text()).not.toContain('WAN')
  })
})
