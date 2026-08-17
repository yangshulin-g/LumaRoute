import { describe, expect, it } from 'vitest'
import {
  CONNECTION_STATUS_LEGEND,
  connectionStatusLabel,
} from './connection-status-label'

describe('connectionStatusLabel', () => {
  it('describes each status with a Chinese color cue', () => {
    expect(connectionStatusLabel('unknown')).toMatch(/灰/)
    expect(connectionStatusLabel('checking')).toMatch(/黄/)
    expect(connectionStatusLabel('healthy')).toMatch(/绿/)
    expect(connectionStatusLabel('unhealthy')).toMatch(/红/)
  })

  it('exposes a short legend for settings/diagnostics', () => {
    expect(CONNECTION_STATUS_LEGEND).toMatch(/灰.*黄.*绿.*红/)
  })
})
