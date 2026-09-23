import { AppError } from '@lumaroute/core'
import { describe, expect, it } from 'vitest'
import { reauthErrorMessage } from './reauth-error-message'

describe('reauthErrorMessage', () => {
  it.each([
    [
      new AppError('UserMismatch', 'The account does not match this server profile'),
      '该账号不是此服务器配置的用户。如需使用其他账号，请作为新服务器添加。',
    ],
    [
      new AppError('AuthenticationExpired', 'Server credential was rejected'),
      '密码错误或账号不可用。请确认服务端的新密码后重试。',
    ],
    [
      { code: 'ServerMismatch', message: 'The line belongs to a different server' },
      '线路返回的服务器与此配置不一致，未保存新凭证。',
    ],
    [new AppError('LineTimeout', 'Request timed out'), '连接超时。请检查线路与网络后重试。'],
  ])('maps reauthentication failure %#', (error, expected) => {
    expect(reauthErrorMessage(error)).toBe(expected)
  })
})
