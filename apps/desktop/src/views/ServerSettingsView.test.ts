import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ServerSettingsView from './ServerSettingsView.vue'
import type { ServerProfile } from '@lumaroute/core'

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
  activeServerId?: string | null
}) {
  const selectServer = options.selectServer ?? vi.fn().mockResolvedValue(undefined)
  const reorderServers = options.reorderServers ?? vi.fn().mockResolvedValue(undefined)
  const deleteServer = options.deleteServer ?? vi.fn().mockResolvedValue(undefined)
  const addLine = options.addLine ?? vi.fn().mockResolvedValue(undefined)
  const setPreferredLine = options.setPreferredLine ?? vi.fn().mockResolvedValue(undefined)
  const updateLines = options.updateLines ?? vi.fn().mockResolvedValue(undefined)
  const renameServer = options.renameServer ?? vi.fn().mockResolvedValue(undefined)
  const activeServerId = options.activeServerId ?? options.profiles[0]?.id ?? null
  const activeProfile =
    options.profiles.find((profile) => profile.id === activeServerId) ?? options.profiles[0]!

  const wrapper = mount(ServerSettingsView, {
    props: {
      profiles: options.profiles,
      profile: activeProfile,
      activeServerId,
      activeLineId: activeProfile.preferredLineId,
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
      saveProfile: vi.fn() as unknown as (profile: ServerProfile) => Promise<void>,
    },
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
})
