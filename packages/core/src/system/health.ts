export interface AppHealth {
  status: 'ready'
  version: string
}

export function healthCheck(): AppHealth {
  return { status: 'ready', version: '0.1.0' }
}
