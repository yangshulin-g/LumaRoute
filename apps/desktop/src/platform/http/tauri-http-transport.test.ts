import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OriginPolicy } from './origin-policy'
import { TauriHttpTransport } from './tauri-http-transport'

describe('TauriHttpTransport', () => {
  const fetchMock = vi.fn()
  let transport: TauriHttpTransport

  beforeEach(() => {
    fetchMock.mockReset()
    const policy = new OriginPolicy(() => ['https://saved.example'])
    transport = new TauriHttpTransport(policy, fetchMock as unknown as typeof fetch)
  })

  it('rejects a cross-origin redirect', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://attacker.example/collect' },
      }),
    )
    await expect(
      transport.request({
        baseUrl: 'https://saved.example',
        path: '/System/Info',
        method: 'GET',
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: 'NetworkUnavailable' })
  })

  it('identifies native requests with a browser-compatible LumaRoute user agent', async () => {
    fetchMock.mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await transport.request({
      baseUrl: 'https://saved.example',
      path: '/System/Info/Public',
      method: 'GET',
      timeoutMs: 1_000,
    })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(new Headers(init?.headers).get('user-agent')).toBe(
      'Mozilla/5.0 (compatible; LumaRoute/0.1.0)',
    )
  })

  it('returns bytes for binary responseType without parsing JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
    )
    const response = await transport.request<Uint8Array>({
      baseUrl: 'https://saved.example',
      path: '/Items/item-1/Images/Primary',
      method: 'GET',
      timeoutMs: 1_000,
      responseType: 'bytes',
    })
    expect(response.data).toBeInstanceOf(Uint8Array)
    expect(Array.from(response.data)).toEqual([1, 2, 3])
  })

  it('preserves an HTTP error status without parsing a non-JSON body', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Forbidden</html>', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      }),
    )

    await expect(
      transport.request({
        baseUrl: 'https://saved.example',
        path: '/System/Info/Public',
        method: 'GET',
        timeoutMs: 1_000,
      }),
    ).resolves.toMatchObject({ status: 403, data: undefined })
  })

  it('classifies TLS failures from the native HTTP plugin', async () => {
    fetchMock.mockRejectedValue('error sending request: invalid peer certificate: UnknownIssuer')

    await expect(
      transport.request({
        baseUrl: 'https://saved.example',
        path: '/System/Info/Public',
        method: 'GET',
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({
      code: 'NetworkUnavailable',
      message: 'TLS certificate validation failed',
    })
  })

  it('clears the timeout after the request settles so late aborts are not signaled', async () => {
    vi.useFakeTimers()
    try {
      let seen: AbortSignal | undefined
      fetchMock.mockImplementation(async (_url, init) => {
        seen = init?.signal as AbortSignal
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      })

      await transport.request({
        baseUrl: 'https://saved.example',
        path: '/System/Info/Public',
        method: 'GET',
        timeoutMs: 5_000,
      })

      expect(seen?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(6_000)
      expect(seen?.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})