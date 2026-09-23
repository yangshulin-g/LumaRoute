import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { ServerProfile } from '@lumaroute/core'
import ServerSwitcher from './ServerSwitcher.vue'
import type { ServerConnectionStatus } from '../stores/server-connection-status'

const profiles: ServerProfile[] = [
  {
    id: 'profile-1',
    name: 'Home Emby',
    kind: 'emby',
    serverId: 'srv-1',
    userId: 'u-1',
    username: 'demo',
    credentialKey: 'lumaroute/profile-1',
    preferredLineId: 'line-1',
    lines: [
      {
        id: 'line-1',
        label: '主线路',
        baseUrl: 'https://emby.example',
        priority: 0,
        enabled: true,
      },
    ],
  },
]

function mountSwitcher(options: {
  statusById?: Record<string, ServerConnectionStatus>
  activeId?: string | null
}) {
  return mount(ServerSwitcher, {
    props: {
      profiles,
      activeId: options.activeId ?? 'profile-1',
      statusById: options.statusById ?? {},
    },
  })
}

describe('ServerSwitcher', () => {
  it('shows a green health dot when the server is healthy and hides retry', async () => {
    const wrapper = mountSwitcher({ statusById: { 'profile-1': 'healthy' } })
    await flushPromises()
    const dot = wrapper.get('[data-testid="server-health-profile-1"]')
    expect(dot.attributes('data-status')).toBe('healthy')
    expect(dot.attributes('title')).toMatch(/绿|正常/)
    expect(dot.attributes('aria-label')).toMatch(/绿|正常/)
    expect(wrapper.find('[data-testid="server-retry-profile-1"]').exists()).toBe(false)
  })

  it('exposes Chinese titles for unknown, checking, and unhealthy dots', async () => {
    const unknown = mountSwitcher({ statusById: {} })
    expect(unknown.get('[data-testid="server-health-profile-1"]').attributes('title')).toMatch(
      /灰|尚未|未检查/,
    )

    const checking = mountSwitcher({ statusById: { 'profile-1': 'checking' } })
    expect(checking.get('[data-testid="server-health-profile-1"]').attributes('title')).toMatch(
      /黄|检查/,
    )

    const unhealthy = mountSwitcher({ statusById: { 'profile-1': 'unhealthy' } })
    expect(unhealthy.get('[data-testid="server-health-profile-1"]').attributes('title')).toMatch(
      /红|异常/,
    )
  })

  it('shows a red health dot and retry when unhealthy', async () => {
    const wrapper = mountSwitcher({ statusById: { 'profile-1': 'unhealthy' } })
    await flushPromises()
    expect(wrapper.get('[data-testid="server-health-profile-1"]').attributes('data-status')).toBe(
      'unhealthy',
    )
    const retry = wrapper.get('[data-testid="server-retry-profile-1"]')
    await retry.trigger('click')
    expect(wrapper.emitted('retry')).toEqual([['profile-1']])
  })

  it('shows a checking pulse without retry', async () => {
    const wrapper = mountSwitcher({ statusById: { 'profile-1': 'checking' } })
    await flushPromises()
    expect(wrapper.get('[data-testid="server-health-profile-1"]').attributes('data-status')).toBe(
      'checking',
    )
    expect(wrapper.find('[data-testid="server-retry-profile-1"]').exists()).toBe(false)
  })

  it('emits add from the labelled plus button next to the heading', async () => {
    const wrapper = mountSwitcher({})
    const add = wrapper.get('[data-testid="add-server"]')
    expect(add.attributes('aria-label')).toBe('添加服务器')
    expect(add.text()).toBe('+')
    await add.trigger('click')
    expect(wrapper.emitted('add')).toEqual([[]])
  })

  it('offers re-login only for an unhealthy server whose credential expired', async () => {
    const wrapper = mount(ServerSwitcher, {
      props: {
        profiles,
        activeId: 'profile-1',
        statusById: { 'profile-1': 'unhealthy' },
        needsReauthById: { 'profile-1': true },
      },
    })
    const reauth = wrapper.get('[data-testid="server-reauth-profile-1"]')
    expect(reauth.text()).toBe('重新登录')
    await reauth.trigger('click')
    expect(wrapper.emitted('reauth')).toEqual([['profile-1']])
    expect(wrapper.emitted('select')).toBeUndefined()

    const offline = mountSwitcher({ statusById: { 'profile-1': 'unhealthy' } })
    expect(offline.find('[data-testid="server-reauth-profile-1"]').exists()).toBe(false)
  })
})
