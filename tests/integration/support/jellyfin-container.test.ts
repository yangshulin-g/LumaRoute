import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  configureStartupUser,
  controlledFixtureDirectory,
  controlledPublicSample,
  ensureControlledMediaFixture,
  fetchJsonWithRetry,
  libraryOptionsForFixture,
  probeContainerRuntime,
  randomPassword,
} from './jellyfin-container'

describe('Jellyfin harness helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('generates a first-user password that includes mixed case and a digit', () => {
    for (let index = 0; index < 20; index += 1) {
      const password = randomPassword()
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/\d/)
      expect(password.length).toBeGreaterThanOrEqual(12)
    }
  })

  it('retries a transient docker probe failure then reports available', async () => {
    const calls = { count: 0 }
    const available = await probeContainerRuntime({
      platform: 'linux',
      delayMs: 0,
      probe: async () => {
        calls.count += 1
        if (calls.count < 3) throw new Error('docker daemon starting')
      },
    })
    expect(available).toBe(true)
    expect(calls.count).toBe(3)
  })

  it('does not treat Windows hosts as a usable Jellyfin container runtime', async () => {
    await expect(
      probeContainerRuntime({
        platform: 'win32',
        delayMs: 0,
        probe: async () => {
          /* docker info would succeed on some Windows runners */
        },
      }),
    ).resolves.toBe(false)
  })

  it('keeps a scannable MP4 fixture with ftyp, moov, and mdat', async () => {
    await ensureControlledMediaFixture()
    const bytes = await readFile(path.join(controlledFixtureDirectory(), 'sample.mp4'))
    for (const box of ['ftyp', 'moov', 'mdat'] as const) {
      expect(bytes.includes(Buffer.from(box)), box).toBe(true)
    }
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })

  it('adds the fixture library without internet metadata providers', () => {
    expect(controlledPublicSample()).toBe('/data/lumaroute-media')
    expect(libraryOptionsForFixture(controlledPublicSample())).toMatchObject({
      PathInfos: [{ Path: '/data/lumaroute-media' }],
      EnablePhotos: false,
      EnableInternetProviders: false,
      SaveLocalMetadata: false,
      EnableRealtimeMonitor: false,
    })
  })

  it('retries a transient 500 from the startup wizard then succeeds', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      async () => {
        calls += 1
        if (calls === 1) {
          return new Response('Error processing request.', { status: 500 })
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      },
    )

    await expect(
      fetchJsonWithRetry('http://127.0.0.1:8096/Startup/User', {
        method: 'POST',
        body: { Name: 'lumaroute-test', Password: 'Lr-Test-1234' },
        retryDelayMs: 0,
      }),
    ).resolves.toEqual({})
    expect(calls).toBe(2)
  })

  it('uses the placeholder first-user name when POST /Startup/User returns 500', async () => {
    const requests: string[] = []
    vi.stubGlobal(
      'fetch',
      async (url: string | URL, init?: RequestInit) => {
        const href = String(url)
        requests.push(`${init?.method ?? 'GET'} ${href}`)
        if (href.endsWith('/Startup/User') && (init?.method ?? 'GET') === 'GET') {
          return new Response(JSON.stringify({ Name: 'jellyfin' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (href.endsWith('/Startup/User') && init?.method === 'POST') {
          return new Response('Error processing request.', { status: 500 })
        }
        throw new Error(`unexpected ${init?.method} ${href}`)
      },
    )

    await expect(
      configureStartupUser('http://127.0.0.1:8096', {
        username: 'lumaroute-test',
        password: 'Lr1-secret',
      }),
    ).resolves.toEqual({
      username: 'jellyfin',
      password: 'Lr1-secret',
      passwordSet: false,
    })
    expect(requests).toContain('GET http://127.0.0.1:8096/Startup/User')
    expect(requests).toContain('POST http://127.0.0.1:8096/Startup/User')
  })

  it('keeps the requested first-user name when POST /Startup/User succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      async (url: string | URL, init?: RequestInit) => {
        const href = String(url)
        if (href.endsWith('/Startup/User') && (init?.method ?? 'GET') === 'GET') {
          return new Response(JSON.stringify({ Name: 'jellyfin' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }
        if (href.endsWith('/Startup/User') && init?.method === 'POST') {
          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
        }
        throw new Error(`unexpected ${init?.method} ${href}`)
      },
    )

    await expect(
      configureStartupUser('http://127.0.0.1:8096', {
        username: 'lumaroute-test',
        password: 'Lr1-secret',
      }),
    ).resolves.toEqual({
      username: 'lumaroute-test',
      password: 'Lr1-secret',
      passwordSet: true,
    })
  })
})
