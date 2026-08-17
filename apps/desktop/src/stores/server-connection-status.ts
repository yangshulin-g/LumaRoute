import { AppError } from '@lumaroute/core'

/** Per-server reachability as observed by home/library probes. */
export type ServerConnectionStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy'

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

/** Map browse/credential failures to short Chinese UI copy (no secrets). */
export function connectionErrorMessage(error: unknown): string {
  const code = errorField(error, 'code')
  const detail = errorText(error)

  if (error instanceof AppError) {
    switch (error.code) {
      case 'AuthenticationExpired':
        return '凭证不可用或已失效。请确认钥匙串授权后重试，或重新登录。'
      case 'LineTimeout':
        return '连接超时。请检查线路与网络后重试。'
      case 'NetworkUnavailable':
        return '无法连接服务器。请检查线路、DNS 或网络后重试。'
      case 'StorageFailure':
        return '本地配置读取失败。请重试或检查应用数据。'
      default:
        break
    }
  }

  if (code === 'AuthenticationExpired' || /credential|keychain|钥匙串/i.test(detail)) {
    return '凭证不可用或已失效。请确认钥匙串授权后重试，或重新登录。'
  }
  if (code === 'LineTimeout' || /timed?\s*out|timeout/i.test(detail)) {
    return '连接超时。请检查线路与网络后重试。'
  }
  if (code === 'NetworkUnavailable') {
    return '无法连接服务器。请检查线路、DNS 或网络后重试。'
  }
  if (detail) return `加载失败：${detail}`
  return '加载失败。请重试。'
}

function errorField(error: unknown, field: 'code' | 'message' | 'cause'): unknown {
  if (typeof error !== 'object' || error === null || !(field in error)) return undefined
  return (error as Record<string, unknown>)[field]
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) {
    return `${error.message} ${error.cause === undefined ? '' : errorText(error.cause)}`.trim()
  }
  const message = errorField(error, 'message')
  const cause = errorField(error, 'cause')
  return [typeof message === 'string' ? message : '', cause === undefined ? '' : errorText(cause)]
    .filter(Boolean)
    .join(' ')
}
