import { describe, expect, it } from 'vitest'
import type { ServerProfile } from '../server/types'
import { createDiagnosticService } from './diagnostic-service'

const profileWithPrivateLine: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'jellyfin',
  serverId: 'server-a',
  userId: 'user-a',
  username: 'alice',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'line-private',
  lines: [
    {
      id: 'line-private',
      label: 'Private',
      baseUrl: 'https://private.example',
      priority: 0,
      enabled: true,
    },
  ],
}

describe('DiagnosticService', () => {
  it('copies actionable codes and platform data without private fields', () => {
    const service = createDiagnosticService({
      sensitiveLineIds: ['line-private'],
      profiles: [profileWithPrivateLine],
      records: [
        {
          level: 'error',
          code: 'NetworkUnavailable',
          message: 'request failed',
          context: { token: 'secret', baseUrl: 'https://private.example' },
        },
      ],
      environment: {
        platform: 'darwin',
        appVersion: '0.1.0',
      },
    })
    const report = service.copyableReport()
    expect(report).toContain('NetworkUnavailable')
    expect(report).toContain('darwin')
    expect(report).not.toContain('secret')
    expect(report).not.toContain('private.example')
  })
})
