import { describe, expect, it, vi } from 'vitest'
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
})
