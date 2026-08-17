import { describe, expect, it } from 'vitest'
import { OriginPolicy } from './origin-policy'

describe('OriginPolicy', () => {
  it('allows saved origins and one scoped onboarding origin only', async () => {
    const policy = new OriginPolicy(() => ['https://saved.example'])
    expect(() => policy.assertAllowed('https://saved.example')).not.toThrow()
    expect(() => policy.assertAllowed('https://other.example')).toThrow()
    await policy.withEphemeralOrigin('http://nas:8096', async () => {
      expect(() => policy.assertAllowed('http://nas:8096')).not.toThrow()
    })
    expect(() => policy.assertAllowed('http://nas:8096')).toThrow()
  })
})
