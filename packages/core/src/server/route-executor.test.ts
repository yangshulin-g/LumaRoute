import { beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../errors/app-error'
import { canFailOver, RouteExecutor } from './route-executor'
import type { ServerProfile } from './types'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'jellyfin',
  serverId: 'server-a',
  userId: 'user-a',
  username: 'alice',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'preferred',
  lines: [
    { id: 'preferred', label: 'LAN', baseUrl: 'http://192.168.1.2:8096', priority: 0, enabled: true },
    { id: 'backup-1', label: 'WAN', baseUrl: 'https://wan.example', priority: 1, enabled: true },
    { id: 'backup-2', label: 'Alt', baseUrl: 'https://alt.example', priority: 2, enabled: true },
  ],
}

function makeFailure(failure: string | number): unknown {
  if (failure === 'timeout') return new AppError('LineTimeout', 'Request timed out')
  if (failure === 'dns') return new AppError('NetworkUnavailable', 'DNS lookup failed')
  if (typeof failure === 'number') {
    return Object.assign(new Error(`HTTP ${failure}`), { status: failure })
  }
  throw new Error(`Unsupported failure fixture: ${String(failure)}`)
}

describe('canFailOver', () => {
  it.each([
    ['timeout', true],
    ['dns', true],
    [502, true],
    [503, true],
    [504, true],
    [401, false],
    [403, false],
    [404, false],
  ])('classifies %s failover as %s', (failure, expected) => {
    expect(canFailOver(makeFailure(failure))).toBe(expected)
  })
})

describe('RouteExecutor', () => {
  let executor: RouteExecutor

  beforeEach(() => {
    executor = new RouteExecutor()
  })

  it('never overlaps line attempts and sticks to the successful line', async () => {
    let active = 0
    let maxActive = 0
    const attempted: string[] = []
    const result = await executor.execute(profile, async (line) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      attempted.push(line.id)
      active -= 1
      if (line.id === 'preferred') throw makeFailure(503)
      return 'ok'
    })
    expect(result).toEqual({ value: 'ok', lineId: 'backup-1' })
    expect(attempted).toEqual(['preferred', 'backup-1'])
    expect(maxActive).toBe(1)
    expect(executor.currentLine(profile.id)).toBe('backup-1')
  })

  it('does not fail over on authentication errors', async () => {
    await expect(
      executor.execute(profile, async () => {
        throw makeFailure(401)
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(executor.currentLine(profile.id)).toBeNull()
  })

  it('lets manual selection override sticky routing', async () => {
    executor.markManualSelection(profile.id, 'backup-2')
    const attempted: string[] = []
    const result = await executor.execute(profile, async (line) => {
      attempted.push(line.id)
      return 'manual'
    })
    expect(result).toEqual({ value: 'manual', lineId: 'backup-2' })
    expect(attempted).toEqual(['backup-2'])
  })
})
