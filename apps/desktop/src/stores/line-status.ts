import { AppError } from '@lumaroute/core'

export type LineStatusState =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'success'; lineId: string }
  | { state: 'failure'; reason: LineStatusReason }

export type LineStatusReason =
  | 'timeout'
  | 'authentication-failed'
  | 'server-mismatch'
  | 'unknown'

export function toLineStatusReason(error: unknown): LineStatusReason {
  if (error instanceof AppError) {
    if (error.code === 'ServerMismatch') return 'server-mismatch'
    if (error.code === 'AuthenticationExpired') return 'authentication-failed'
    if (error.code === 'LineTimeout') return 'timeout'
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code)
    if (code === 'ServerMismatch') return 'server-mismatch'
    if (code === 'AuthenticationExpired') return 'authentication-failed'
    if (code === 'LineTimeout') return 'timeout'
  }
  return 'unknown'
}

export function lineStatusMessage(status: LineStatusState): string | null {
  if (status.state === 'testing') return '正在测试线路…'
  if (status.state === 'success') return '线路验证通过'
  if (status.state === 'failure') {
    switch (status.reason) {
      case 'server-mismatch':
        return 'ServerId 不匹配'
      case 'authentication-failed':
        return '认证失败'
      case 'timeout':
        return '线路超时'
      default:
        return '无法添加线路'
    }
  }
  return null
}
