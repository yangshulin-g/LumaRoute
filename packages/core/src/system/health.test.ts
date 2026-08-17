import { describe, expect, it } from 'vitest'
import { healthCheck } from './health'

describe('healthCheck', () => {
  it('returns a ready status and semantic version', () => {
    expect(healthCheck()).toEqual({ status: 'ready', version: '0.1.0' })
  })
})
