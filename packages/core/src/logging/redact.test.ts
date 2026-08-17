import { describe, expect, it } from 'vitest'
import { redact } from './redact'

describe('redact', () => {
  it('redacts nested credentials, auth query values, headers, and marked origins', () => {
    const input = {
      password: 'plain-password',
      accessToken: 'access-token',
      request: {
        url: 'https://private.example/Items?api_key=query-token&safe=value',
        headers: {
          Authorization: 'Bearer auth-token',
          'X-Emby-Token': 'emby-token',
          Accept: 'application/json',
        },
      },
    }
    const output = JSON.stringify(
      redact(input, {
        sensitiveOrigins: ['https://private.example'],
      }),
    )
    for (const secret of [
      'plain-password',
      'access-token',
      'query-token',
      'auth-token',
      'emby-token',
      'private.example',
    ]) {
      expect(output).not.toContain(secret)
    }
    expect(output).toContain('safe=value')
    expect(output).toContain('application/json')
  })

  it('handles arrays, Error causes, cycles, and case-insensitive keys', () => {
    const value: Record<string, unknown> = { ToKeN: 'secret' }
    value.self = value
    expect(() => redact(value, { sensitiveOrigins: [] })).not.toThrow()
    expect(JSON.stringify(redact(value, { sensitiveOrigins: [] }))).not.toContain('secret')

    const withArray = {
      items: [{ password: 'array-secret' }, 'https://x.example?api_key=array-token'],
    }
    const arrayOutput = JSON.stringify(redact(withArray, { sensitiveOrigins: [] }))
    expect(arrayOutput).not.toContain('array-secret')
    expect(arrayOutput).not.toContain('array-token')

    const err = new Error('boom with token=leak-value')
    ;(err as Error & { cause?: unknown }).cause = { accessToken: 'cause-token' }
    const errorOutput = JSON.stringify(redact(err, { sensitiveOrigins: [] }))
    expect(errorOutput).not.toContain('cause-token')
  })
})
