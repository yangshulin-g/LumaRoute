import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJsonWithRetry, randomPassword } from './jellyfin-container'

describe('Jellyfin harness helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('generates a first-user password that includes mixed case and a digit', () => {
    for (let index = 0; index < 20; index += 1) {
      const password = randomPassword()
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/\d/)
      expect(password.length).toBeGreaterThanOrEqual(12)
    }
  })

  it('retries a transient 500 from the startup wizard then succeeds', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      async () => {
        calls += 1
        if (calls === 1) {
          return new Response('Error processing request.', { status: 500 })
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      },
    )

    await expect(
      fetchJsonWithRetry('http://127.0.0.1:8096/Startup/User', {
        method: 'POST',
        body: { Name: 'lumaroute-test', Password: 'Lr-Test-1234' },
        retryDelayMs: 0,
      }),
    ).resolves.toEqual({})
    expect(calls).toBe(2)
  })
})
