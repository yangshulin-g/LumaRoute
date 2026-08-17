import { AppError } from '@lumaroute/core'
import { describe, expect, it } from 'vitest'
import {
  connectionErrorMessage,
  isAbortError,
} from './server-connection-status'

describe('server-connection-status', () => {
  it('maps credential failures to a Chinese keychain/retry hint', () => {
    expect(connectionErrorMessage(new AppError('AuthenticationExpired', 'unavailable'))).toMatch(
      /凭证|钥匙串|重新登录/,
    )
  })

  it('detects abort errors without treating them as connection failures', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true)
    expect(isAbortError(new AppError('NetworkUnavailable', 'down'))).toBe(false)
  })
})
