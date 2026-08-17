import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateManifest } from './verify-mpv.mjs'

function fixtureManifest() {
  const build = (extra = {}) => ({
    version: '0.41.0',
    sourceUrl: 'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-example.zip',
    sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    executable: 'mpv',
    licenses: [
      {
        id: 'mpv',
        path: 'resources/third-party/mpv-LICENSE.txt',
        sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ],
    ...extra,
  })

  return {
    schemaVersion: 1,
    builds: {
      'x86_64-pc-windows-msvc': build({
        sourceUrl:
          'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-x86_64-pc-windows-msvc.zip',
        executable: 'mpv.exe',
      }),
      'x86_64-apple-darwin': build({
        sourceUrl:
          'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-macos-15-intel.zip',
      }),
      'aarch64-apple-darwin': build({
        sourceUrl:
          'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-macos-15-arm.zip',
      }),
      'x86_64-unknown-linux-gnu': build({
        sourceUrl:
          'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-x86_64-linux.tar.gz',
      }),
    },
  }
}

describe('mpv manifest', () => {
  it('requires four tested targets and immutable sha256 values', () => {
    const manifest = fixtureManifest()
    assert.doesNotThrow(() => validateManifest(manifest))
    delete manifest.builds['x86_64-unknown-linux-gnu']
    assert.throws(() => validateManifest(manifest), /missing target/)
  })

  it('rejects mutable URLs and malformed hashes', () => {
    const manifest = fixtureManifest()
    manifest.builds['x86_64-pc-windows-msvc'].sourceUrl = 'https://example.invalid/latest.zip'
    manifest.builds['x86_64-pc-windows-msvc'].sha256 = 'abc'
    assert.throws(() => validateManifest(manifest))
  })
})
