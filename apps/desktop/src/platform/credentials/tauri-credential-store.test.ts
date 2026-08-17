import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TauriCredentialStore } from './tauri-credential-store'

const invoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}))

describe('TauriCredentialStore', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('namespaces set/get/delete through native commands', async () => {
    const store = new TauriCredentialStore()
    invoke.mockResolvedValueOnce(undefined)
    await store.set('lumaroute/profile-1', 'secret-token')
    expect(invoke).toHaveBeenCalledWith('credential_set', {
      input: { credentialKey: 'lumaroute/profile-1', token: 'secret-token' },
    })

    await expect(store.get('lumaroute/profile-1')).resolves.toBe('secret-token')
    expect(invoke).toHaveBeenCalledTimes(1)

    invoke.mockResolvedValueOnce(undefined)
    await store.delete('lumaroute/profile-1')
    expect(invoke).toHaveBeenCalledWith('credential_delete', {
      credentialKey: 'lumaroute/profile-1',
    })
  })

  it('reads native keychain only once per credentialKey in a session', async () => {
    const store = new TauriCredentialStore()
    invoke.mockResolvedValue('secret-token')

    await expect(store.get('lumaroute/profile-1')).resolves.toBe('secret-token')
    await expect(store.get('lumaroute/profile-1')).resolves.toBe('secret-token')
    await expect(store.get('lumaroute/profile-1')).resolves.toBe('secret-token')

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('credential_get', {
      credentialKey: 'lumaroute/profile-1',
    })
  })

  it('does not re-hit native after a cached miss', async () => {
    const store = new TauriCredentialStore()
    invoke.mockResolvedValue(null)

    await expect(store.get('lumaroute/missing')).resolves.toBeNull()
    await expect(store.get('lumaroute/missing')).resolves.toBeNull()
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent first reads for the same credentialKey', async () => {
    const store = new TauriCredentialStore()
    let resolveInvoke: ((value: string) => void) | undefined
    invoke.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveInvoke = resolve
        }),
    )

    const first = store.get('lumaroute/profile-1')
    const second = store.get('lumaroute/profile-1')
    expect(invoke).toHaveBeenCalledTimes(1)

    resolveInvoke?.('secret-token')
    await expect(first).resolves.toBe('secret-token')
    await expect(second).resolves.toBe('secret-token')
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})