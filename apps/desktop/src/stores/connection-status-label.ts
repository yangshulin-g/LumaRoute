import type { ServerConnectionStatus } from './server-connection-status'

export function connectionStatusLabel(status: ServerConnectionStatus): string {
  switch (status) {
    case 'healthy':
      return '绿色：连接正常'
    case 'checking':
      return '黄色：正在检查连接'
    case 'unhealthy':
      return '红色：连接异常，可重试'
    default:
      return '灰色：尚未检查'
  }
}

export const CONNECTION_STATUS_LEGEND =
  '状态点：灰=尚未检查，黄=检查中，绿=正常，红=异常（可重试）'
