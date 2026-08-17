import { invoke } from '@tauri-apps/api/core'
import type { CredentialStore } from '@lumaroute/core'

/**
 * Session-scoped CredentialStore adapter.
 * Tokens stay in process memory after the first successful native read;
 * they are never written to SQLite or durable app config.
 */
export class TauriCredentialStore implements CredentialStore {
  private readonly cache = new Map<string, string | null>()
  private readonly inflight = new Map<string, Promise<string | null>>()

  async set(credentialKey: string, token: string): Promise<void> {
    await invoke('credential_set', {
      input: { credentialKey, token },
    })
    this.cache.set(credentialKey, token)
  }

  async get(credentialKey: string): Promise<string | null> {
    if (this.cache.has(credentialKey)) {
      return this.cache.get(credentialKey) ?? null
    }

    const pending = this.inflight.get(credentialKey)
    if (pending) return pending

    const request = invoke<string | null>('credential_get', { credentialKey })
      .then((token) => {
        this.cache.set(credentialKey, token)
        return token
      })
      .finally(() => {
        this.inflight.delete(credentialKey)
      })
    this.inflight.set(credentialKey, request)
    return request
  }

  async delete(credentialKey: string): Promise<void> {
    await invoke('credential_delete', { credentialKey })
    this.cache.set(credentialKey, null)
  }
}
