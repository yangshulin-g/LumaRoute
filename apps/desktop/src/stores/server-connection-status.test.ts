import { AppError } from '@lumaroute/core'
import { describe, expect, it } from 'vitest'
import {
  connectionErrorMessage,
  isAbortError,
  USER_MISMATCH_MESSAGE,
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

  it('maps UserMismatch to the add-as-new-server guidance', () => {
    expect(connectionErrorMessage(new AppError('UserMismatch', 'mismatch'))).toBe(
      '该账号不是此服务器配置的用户。如需使用其他账号，请作为新服务器添加。',
    )
    expect(connectionErrorMessage({ code: 'UserMismatch', message: 'mismatch' })).toBe(
      USER_MISMATCH_MESSAGE,
    )
  })
})
