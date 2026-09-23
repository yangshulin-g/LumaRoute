import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ServerSettingsView from './ServerSettingsView.vue'
import { AppError, type ServerProfile } from '@lumaroute/core'

const profileOne: ServerProfile = {
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

const profileTwo: ServerProfile = {
  ...profileOne,
  id: 'profile-2',
  name: 'Office',
  serverId: 'server-b',
  credentialKey: 'lumaroute/profile-2',
  preferredLineId: 'line-3',
  lines: [
    { id: 'line-3', label: 'LAN', baseUrl: 'http://10.0.0.2:8096', priority: 0, enabled: true },
  ],
}

function mountSettings(options: {
  profiles: ServerProfile[]
  selectServer?: ReturnType<typeof vi.fn>
  reorderServers?: ReturnType<typeof vi.fn>
  deleteServer?: ReturnType<typeof vi.fn>
  addLine?: ReturnType<typeof vi.fn>
  setPreferredLine?: ReturnType<typeof vi.fn>
  updateLines?: ReturnType<typeof vi.fn>
  renameServer?: ReturnType<typeof vi.fn>
  reauthenticate?: ReturnType<typeof vi.fn>
  reauthOpen?: boolean
  activeServerId?: string | null
  activeLineId?: string | null
}) {
  const selectServer = options.selectServer ?? vi.fn().mockResolvedValue(undefined)
  const reorderServers = options.reorderServers ?? vi.fn().mockResolvedValue(undefined)
  const deleteServer = options.deleteServer ?? vi.fn().mockResolvedValue(undefined)
  const addLine = options.addLine ?? vi.fn().mockResolvedValue(undefined)
  const setPreferredLine = options.setPreferredLine ?? vi.fn().mockResolvedValue(undefined)
  const updateLines = options.updateLines ?? vi.fn().mockResolvedValue(undefined)
  const renameServer = options.renameServer ?? vi.fn().mockResolvedValue(undefined)
  const reauthenticate = options.reauthenticate ?? vi.fn().mockResolvedValue(undefined)
  const activeServerId = options.activeServerId ?? options.profiles[0]?.id ?? null
  const activeProfile =
    options.profiles.find((profile) => profile.id === activeServerId) ?? options.profiles[0]!

  const wrapper = mount(ServerSettingsView, {
    props: {
      profiles: options.profiles,
      profile: activeProfile,
      activeServerId,
      activeLineId:
        options.activeLineId === undefined ? activeProfile.preferredLineId : options.activeLineId,
      selectServer: selectServer as (profileId: string) => Promise<void>,
      reorderServers: reorderServers as (profileIds: readonly string[]) => Promise<void>,
      deleteServer: deleteServer as (profileId: string) => Promise<void>,
      addLine: addLine as (draft: import('@lumaroute/core').ServerLine) => Promise<void>,
      setPreferredLine: setPreferredLine as (
        profileId: string,
        lineId: string,
      ) => Promise<void>,
      updateLines: updateLines as (
        profileId: string,
        lines: import('@lumaroute/core').ServerLine[],
        preferredLineId: string,
      ) => Promise<void>,
      renameServer: renameServer as (profileId: string, name: string) => Promise<void>,
      reauthOpen: options.reauthOpen ?? false,
      reauthenticate: reauthenticate as (profileId: string, password: string) => Promise<void>,
      saveProfile: vi.fn() as unknown as (profile: ServerProfile) => Promise<void>,
    },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })

  return {
    wrapper,
    selectServer,
    reorderServers,
    deleteServer,
    addLine,
    setPreferredLine,
    updateLines,
    renameServer,
    reauthenticate,
  }
}

describe('ServerSettingsView', () => {
  it('shows mismatch without saving and applies a manually preferred line', async () => {
    const { wrapper, setPreferredLine } = mountSettings({
      profiles: [profileOne],
      addLine: vi.fn().mockRejectedValueOnce({ code: 'ServerMismatch' }),
      setPreferredLine: vi.fn().mockResolvedValue(undefined),
    })

    await wrapper.get('[data-testid="add-line"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('ServerId 不匹配')

    await wrapper.get('[data-testid="prefer-line-2"]').trigger('click')
    expect(setPreferredLine).toHaveBeenCalledWith('profile-1', 'line-2')
    expect(wrapper.get('[data-testid="active-line"]').text()).toContain('WAN')
  })

  it('switches, reorders, and deletes logical servers', async () => {
    const { wrapper, selectServer, reorderServers, deleteServer } = mountSettings({
      profiles: [profileOne, profileTwo],
    })
    await wrapper.get('[data-testid="server-profile-2"]').trigger('click')
    expect(selectServer).toHaveBeenCalledWith('profile-2')
    await wrapper.get('[data-testid="move-profile-2-up"]').trigger('click')
    expect(reorderServers).toHaveBeenCalledWith(['profile-2', 'profile-1'])
    await wrapper.get('[data-testid="delete-profile-2"]').trigger('click')
    expect(deleteServer).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="confirm-delete-yes"]').trigger('click')
    expect(deleteServer).toHaveBeenCalledWith('profile-2')
  })

  it('renders only stored and session-derived line facts', () => {
    const { wrapper } = mountSettings({
      profiles: [profileOne],
      activeServerId: 'profile-1',
      activeLineId: 'line-2',
    })
    const lan = wrapper.get('[data-testid="line-item-line-1"]')
    const wan = wrapper.get('[data-testid="line-item-line-2"]')
    expect(lan.text()).toContain('HTTP')
    expect(lan.text()).toContain('首选线路')
    expect(lan.text()).not.toContain('当前线路')
    expect(wan.text()).toContain('HTTPS')
    expect(wan.text()).toContain('当前线路')
    expect(wrapper.text()).not.toMatch(/\d+ms|丢包|QUIC|gRPC/)
  })

  it('omits the protocol chip for a line with an unparseable base URL', () => {
    const broken: ServerProfile = {
      ...profileOne,
      lines: [
        profileOne.lines[0]!,
        { id: 'line-2', label: 'Broken', baseUrl: 'not a url', priority: 1, enabled: true },
      ],
    }
    const { wrapper } = mountSettings({ profiles: [broken], activeServerId: 'profile-1' })
    expect(wrapper.get('[data-testid="line-item-line-1"] .protocol-chip').text()).toBe('HTTP')
    expect(wrapper.find('[data-testid="line-item-line-2"] .protocol-chip').exists()).toBe(false)
  })

  it('never calls the preferred line current without a session line', () => {
    const { wrapper } = mountSettings({
      profiles: [profileOne],
      activeServerId: 'profile-1',
      activeLineId: null,
    })
    expect(wrapper.get('[data-testid="line-item-line-1"]').text()).toContain('首选线路')
    expect(wrapper.get('[data-testid="line-item-line-1"]').text()).not.toContain('当前线路')
    const summary = wrapper.get('[data-testid="active-line"]').text()
    expect(summary).not.toContain('当前线路：LAN')
    expect(summary).toContain('首选线路：LAN')
  })

  it('renames a line label without touching other line fields', async () => {
    const { wrapper, updateLines } = mountSettings({ profiles: [profileOne] })
    await wrapper.get('[data-testid="rename-line-line-1"]').trigger('click')
    await wrapper.get('[data-testid="line-label-input-line-1"]').setValue('  家里  ')
    await wrapper.get('[data-testid="line-item-line-1"] form').trigger('submit')
    await flushPromises()
    expect(updateLines).toHaveBeenCalledWith(
      'profile-1',
      [{ ...profileOne.lines[0]!, label: '家里' }, profileOne.lines[1]!],
      'line-1',
    )
    expect(wrapper.find('[data-testid="line-label-input-line-1"]').exists()).toBe(false)
  })

  it('refuses to save a blank line label', async () => {
    const { wrapper, updateLines } = mountSettings({ profiles: [profileOne] })
    await wrapper.get('[data-testid="rename-line-line-1"]').trigger('click')
    await wrapper.get('[data-testid="line-label-input-line-1"]').setValue('   ')
    await wrapper.get('[data-testid="line-item-line-1"] form').trigger('submit')
    await flushPromises()
    expect(updateLines).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="line-rename-error"]').text()).toBe('线路名称不能为空')
    await wrapper.get('[data-testid="cancel-line-label-line-1"]').trigger('click')
    expect(wrapper.find('[data-testid="line-rename-error"]').exists()).toBe(false)
  })

  it('links to add-server onboarding from the server list', () => {
    const { wrapper } = mountSettings({ profiles: [profileOne] })
    const link = wrapper.getComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({ name: 'onboarding', query: { mode: 'add' } })
    expect(link.text()).toBe('添加服务器')
    expect(link.attributes('data-testid')).toBe('settings-add-server')
  })

  it('re-authenticates the configured account and clears the password', async () => {
    const { wrapper, reauthenticate } = mountSettings({ profiles: [profileOne] })
    expect(wrapper.get('[data-testid="account-username"]').text()).toBe('alice')
    expect(wrapper.find('input[name="reauth-username"]').exists()).toBe(false)
    expect(wrapper.find('input[name="reauth-password"]').exists()).toBe(false)
    await wrapper.get('[data-testid="reauth-open"]').trigger('click')
    const password = wrapper.get('input[name="reauth-password"]')
    await password.setValue('new-password')
    await wrapper.get('[data-testid="reauth-form"]').trigger('submit')
    expect((password.element as HTMLInputElement).value).toBe('')
    await flushPromises()
    expect(reauthenticate).toHaveBeenCalledWith('profile-1', 'new-password')
    expect(wrapper.get('[data-testid="reauth-status"]').text()).toBe('已重新登录')
    expect(wrapper.find('input[name="reauth-password"]').exists()).toBe(false)
  })

  it('shows mapped guidance and clears the password when the account does not match', async () => {
    const { wrapper } = mountSettings({
      profiles: [profileOne],
      reauthenticate: vi
        .fn()
        .mockRejectedValue(new AppError('UserMismatch', 'The account does not match this server profile')),
    })
    await wrapper.get('[data-testid="reauth-open"]').trigger('click')
    await wrapper.get('input[name="reauth-password"]').setValue('other-password')
    await wrapper.get('[data-testid="reauth-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="reauth-error"]').text()).toBe(
      '该账号不是此服务器配置的用户。如需使用其他账号，请作为新服务器添加。',
    )
    expect(
      (wrapper.get('input[name="reauth-password"]').element as HTMLInputElement).value,
    ).toBe('')
    expect(wrapper.find('[data-testid="reauth-status"]').exists()).toBe(false)
  })

  it('opens the account form directly when routed from an expired credential', () => {
    const { wrapper } = mountSettings({ profiles: [profileOne], reauthOpen: true })
    expect(wrapper.find('input[name="reauth-password"]').exists()).toBe(true)
  })

  it('cancels re-login and discards the typed password', async () => {
    const { wrapper, reauthenticate } = mountSettings({ profiles: [profileOne] })
    await wrapper.get('[data-testid="reauth-open"]').trigger('click')
    await wrapper.get('input[name="reauth-password"]').setValue('typed')
    await wrapper.get('[data-testid="reauth-cancel"]').trigger('click')
    expect(wrapper.find('input[name="reauth-password"]').exists()).toBe(false)
    await wrapper.get('[data-testid="reauth-open"]').trigger('click')
    expect(
      (wrapper.get('input[name="reauth-password"]').element as HTMLInputElement).value,
    ).toBe('')
    expect(reauthenticate).not.toHaveBeenCalled()
  })
})
