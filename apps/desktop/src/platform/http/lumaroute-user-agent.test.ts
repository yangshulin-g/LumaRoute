import { describe, expect, it } from 'vitest'
import { headersWithLumaRouteUserAgent, LUMAROUTE_USER_AGENT } from './lumaroute-user-agent'

describe('headersWithLumaRouteUserAgent', () => {
  it('forces the LumaRoute user agent over request headers', () => {
    expect(headersWithLumaRouteUserAgent({ Accept: 'application/json' })).toEqual({
      Accept: 'application/json',
      'User-Agent': LUMAROUTE_USER_AGENT,
    })
  })

  it('replaces a caller-provided user agent', () => {
    expect(
      headersWithLumaRouteUserAgent({
        'user-agent': 'tauri-plugin-http/2.5.9',
        'X-Emby-Token': 'token',
      }),
    ).toEqual({
      'X-Emby-Token': 'token',
      'User-Agent': LUMAROUTE_USER_AGENT,
    })
  })
})
