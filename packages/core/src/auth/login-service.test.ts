import { describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors/app-error'
import type { ServerProfile } from '../server/types'
import { LoginService } from './login-service'

describe('LoginService', () => {
  it('stores only the credential key in the profile', async () => {
    const adapter = {
      authenticate: vi.fn().mockResolvedValue({
        serverId: 'server-a',
        serverName: 'Living Room',
        userId: 'user-a',
        username: 'alice',
        accessToken: 'secret-token',
      }),
      getServerIdentity: vi.fn(),
    }
    const credentials = { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
    const storage = { saveServerProfile: vi.fn() }
    const ids = vi.fn().mockReturnValueOnce('profile-1').mockReturnValueOnce('line-1')
    const service = new LoginService(
      () => adapter,
      storage as never,
      credentials,
      ids,
    )

    const result = await service.addServer({
      name: 'Home',
      kind: 'jellyfin',
      baseUrl: 'https://media.example.com',
      username: 'alice',
      password: 'password-value',
      deviceId: 'device-1',
      appVersion: '0.1.0',
    })

    expect(credentials.set).toHaveBeenCalledWith('lumaroute/profile-1', 'secret-token')
    expect(storage.saveServerProfile).toHaveBeenCalledWith(result.profile)
    expect(result.serverName).toBe('Living Room')
    expect(JSON.stringify(result.profile)).not.toContain('secret-token')
    expect(JSON.stringify(result.profile)).not.toContain('password-value')
  })

  it('removes the credential when profile persistence fails', async () => {
    const adapter = {
      authenticate: vi.fn().mockResolvedValue({
        serverId: 's',
        serverName: 'S',
        userId: 'u',
        username: 'a',
        accessToken: 'token',
      }),
      getServerIdentity: vi.fn(),
    }
    const credentials = { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
    const storage = { saveServerProfile: vi.fn().mockRejectedValue(new Error('disk full')) }
    const ids = vi.fn().mockReturnValueOnce('p').mockReturnValueOnce('l')
    const service = new LoginService(() => adapter, storage as never, credentials, ids)

    await expect(
      service.addServer({
        name: 'S',
        kind: 'emby',
        baseUrl: 'http://nas:8096',
        username: 'a',
        password: 'p',
        deviceId: 'd',
        appVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({ code: 'StorageFailure' })
    expect(credentials.delete).toHaveBeenCalledWith('lumaroute/p')
  })

  it.each<[{ lineLabel?: string }, string]>([
    [{}, '主线路'],
    [{ lineLabel: '   ' }, '主线路'],
    [{ lineLabel: '  家里  ' }, '家里'],
  ])('names the first line from %j', async (extra, expected) => {
    const adapter = {
      authenticate: vi.fn().mockResolvedValue({
        serverId: 'server-a',
        serverName: 'Home',
        userId: 'user-a',
        username: 'alice',
        accessToken: 'token-value',
      }),
      getServerIdentity: vi.fn(),
    }
    const credentials = { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
    const storage = { saveServerProfile: vi.fn() }
    const ids = vi.fn().mockReturnValueOnce('profile-1').mockReturnValueOnce('line-1')
    const service = new LoginService(() => adapter, storage as never, credentials, ids)

    const { profile } = await service.addServer({
      name: 'Home',
      kind: 'jellyfin',
      baseUrl: 'https://media.example.com',
      username: 'alice',
      password: 'password-value',
      deviceId: 'device-1',
      appVersion: '0.1.0',
      ...extra,
    })

    expect(profile.lines[0]?.label).toBe(expected)
    expect(JSON.stringify(profile)).not.toContain('Primary')
  })
})

describe('LoginService.reauthenticate', () => {
  const profile: ServerProfile = {
    id: 'profile-1',
    name: 'Home',
    kind: 'jellyfin',
    serverId: 'server-a',
    userId: 'user-a',
    username: 'alice',
    credentialKey: 'lumaroute/profile-1',
    preferredLineId: 'line-wan',
    lines: [
      { id: 'line-lan', label: '家里', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
      { id: 'line-wan', label: '公网', baseUrl: 'https://media.example.com', priority: 1, enabled: true },
      { id: 'line-off', label: '备用', baseUrl: 'https://off.example.com', priority: 2, enabled: false },
    ],
  }
  const input = {
    profileId: 'profile-1',
    password: 'new-password-value',
    deviceId: 'device-1',
    appVersion: '0.1.0',
  }

  function session(overrides: Record<string, string> = {}) {
    return {
      serverId: 'server-a',
      serverName: 'Home',
      userId: 'user-a',
      username: 'alice',
      accessToken: 'rotated-token',
      ...overrides,
    }
  }

  function setup(authenticate: ReturnType<typeof vi.fn>, stored: ServerProfile | null = profile) {
    const adapter = { authenticate, getServerIdentity: vi.fn() }
    const credentials = { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(stored),
      saveServerProfile: vi.fn(),
    }
    const service = new LoginService(() => adapter as never, storage as never, credentials, vi.fn())
    return { service, credentials, storage, authenticate }
  }

  it('overwrites the token under the same credential key using the stored username', async () => {
    const { service, credentials, storage, authenticate } = setup(
      vi.fn().mockResolvedValue(session()),
    )
    await expect(service.reauthenticate(input)).resolves.toEqual(profile)
    expect(authenticate).toHaveBeenCalledOnce()
    expect(authenticate).toHaveBeenCalledWith({
      baseUrl: 'https://media.example.com',
      username: 'alice',
      password: 'new-password-value',
      deviceId: 'device-1',
      deviceName: 'LumaRoute',
      appVersion: '0.1.0',
    })
    expect(credentials.set).toHaveBeenCalledWith('lumaroute/profile-1', 'rotated-token')
    expect(storage.saveServerProfile).not.toHaveBeenCalled()
  })

  it('rejects a different server with ServerMismatch and keeps the old token', async () => {
    const { service, credentials } = setup(
      vi.fn().mockResolvedValue(session({ serverId: 'server-b' })),
    )
    await expect(service.reauthenticate(input)).rejects.toMatchObject({ code: 'ServerMismatch' })
    expect(credentials.set).not.toHaveBeenCalled()
  })

  it('rejects a different user with UserMismatch and keeps the old token', async () => {
    const { service, credentials } = setup(
      vi.fn().mockResolvedValue(session({ userId: 'user-b' })),
    )
    await expect(service.reauthenticate(input)).rejects.toMatchObject({ code: 'UserMismatch' })
    expect(credentials.set).not.toHaveBeenCalled()
  })

  it('does not mask a rejected password by switching lines', async () => {
    const { service, credentials, authenticate } = setup(
      vi.fn().mockRejectedValue(new AppError('AuthenticationExpired', 'Server credential was rejected')),
    )
    await expect(service.reauthenticate(input)).rejects.toMatchObject({
      code: 'AuthenticationExpired',
    })
    expect(authenticate).toHaveBeenCalledOnce()
    expect(credentials.set).not.toHaveBeenCalled()
  })

  it('fails over on timeout and never tries a disabled line', async () => {
    const { service, credentials, authenticate } = setup(
      vi
        .fn()
        .mockRejectedValueOnce(new AppError('LineTimeout', 'Request timed out'))
        .mockResolvedValueOnce(session()),
    )
    await service.reauthenticate(input)
    expect(authenticate.mock.calls.map(([call]) => call.baseUrl)).toEqual([
      'https://media.example.com',
      'http://192.168.1.2:8096',
    ])
    expect(credentials.set).toHaveBeenCalledWith('lumaroute/profile-1', 'rotated-token')
  })

  it('surfaces the last failover error after every enabled line fails', async () => {
    const { service, authenticate } = setup(
      vi.fn().mockRejectedValue(new AppError('LineTimeout', 'Request timed out')),
    )
    await expect(service.reauthenticate(input)).rejects.toMatchObject({ code: 'LineTimeout' })
    expect(authenticate).toHaveBeenCalledTimes(2)
  })

  it('reports NetworkUnavailable when no line is enabled', async () => {
    const disabled = { ...profile, lines: profile.lines.map((line) => ({ ...line, enabled: false })) }
    const { service, authenticate } = setup(vi.fn(), disabled)
    await expect(service.reauthenticate(input)).rejects.toMatchObject({
      code: 'NetworkUnavailable',
    })
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('reports StorageFailure for an unknown profile', async () => {
    const { service } = setup(vi.fn(), null)
    await expect(service.reauthenticate(input)).rejects.toMatchObject({ code: 'StorageFailure' })
  })

  it('never echoes the password in mismatch errors', async () => {
    const { service } = setup(vi.fn().mockResolvedValue(session({ userId: 'user-b' })))
    const error = await service.reauthenticate(input).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).message).not.toContain('new-password-value')
    expect(JSON.stringify(error)).not.toContain('new-password-value')
  })
})
