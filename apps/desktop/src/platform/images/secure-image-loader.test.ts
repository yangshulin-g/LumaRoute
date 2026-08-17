import { describe, expect, it, vi } from 'vitest'
import type { ServerProfile } from '@lumaroute/core'
import { SecureImageLoader } from './secure-image-loader'

const profile: ServerProfile = {
  id: 'profile-1',
  name: 'Home',
  kind: 'jellyfin',
  serverId: 'server-a',
  userId: 'user-a',
  username: 'alice',
  credentialKey: 'lumaroute/profile-1',
  preferredLineId: 'line-1',
  lines: [
    {
      id: 'line-1',
      label: 'Primary',
      baseUrl: 'https://saved.example',
      priority: 0,
      enabled: true,
    },
  ],
}

describe('SecureImageLoader', () => {
  it('loads an image with a header token and returns a revocable Blob URL', async () => {
    const http = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
        data: new Uint8Array([1, 2, 3]),
      }),
    }
    const storage = {
      getServerProfile: vi.fn().mockResolvedValue(profile),
    }
    const credentials = {
      get: vi.fn().mockResolvedValue('secret-token'),
    }
    const routes = {
      execute: vi.fn(async (_profile: ServerProfile, operation: (line: (typeof profile.lines)[0]) => Promise<unknown>) => {
        const value = await operation(profile.lines[0]!)
        return { value, lineId: profile.lines[0]!.id }
      }),
    }
    const createObjectURL = vi.fn().mockReturnValue('blob:lumaroute-image')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const loader = new SecureImageLoader(
      storage as never,
      credentials as never,
      routes as never,
      http as never,
    )
    const signal = new AbortController().signal
    const url = await loader.load('profile-1', 'item-1', 'tag-1', signal)

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://saved.example',
        path: '/Items/item-1/Images/Primary',
        query: { tag: 'tag-1', maxWidth: 400 },
        headers: { 'X-Emby-Token': 'secret-token' },
        responseType: 'bytes',
      }),
    )
    expect(JSON.stringify(http.request.mock.calls[0]![0].query)).not.toContain('secret-token')
    expect(url).toBe('blob:lumaroute-image')
    loader.release(url)
    expect(revokeObjectURL).toHaveBeenCalledWith(url)
    vi.unstubAllGlobals()
  })
})
