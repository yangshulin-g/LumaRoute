import { connectionErrorMessage } from '../stores/server-connection-status'

/** Map re-login failures to Chinese UI copy; never includes the submitted password. */
export function reauthErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined
  if (code === 'AuthenticationExpired') {
    return '密码错误或账号不可用。请确认服务端的新密码后重试。'
  }
  if (code === 'ServerMismatch') {
    return '线路返回的服务器与此配置不一致，未保存新凭证。'
  }
  return connectionErrorMessage(error)
}
