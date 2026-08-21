import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { expectedExtensions, requireArtifacts, validateAlphaMarker } from './smoke-packaged.mjs'

describe('packaged smoke', () => {
  it('requires the exact artifact family for each target', () => {
    assert.deepEqual(expectedExtensions('x86_64-pc-windows-msvc'), ['.msi', '-setup.exe'])
    assert.deepEqual(expectedExtensions('x86_64-apple-darwin'), ['.dmg'])
    assert.deepEqual(expectedExtensions('aarch64-apple-darwin'), ['.dmg'])
    assert.deepEqual(expectedExtensions('x86_64-unknown-linux-gnu'), ['.AppImage', '.deb'])
  })

  it('requires all four Internal Alpha warnings', () => {
    assert.doesNotThrow(() =>
      validateAlphaMarker(
        [
          'UNSIGNED OR UNNOTARIZED',
          'INTERNAL TECHNICAL VALIDATION ONLY',
          'OPERATING SYSTEM SECURITY WARNINGS MAY APPEAR',
          'NOT FOR PUBLIC END-USER DISTRIBUTION',
        ].join('\n'),
      ),
    )
  })

  it('rejects a marker missing any Internal Alpha warning', () => {
    assert.throws(
      () => validateAlphaMarker('LumaRoute development package\nThis build is intentionally UNSIGNED.'),
      /UNSIGNED OR UNNOTARIZED/,
    )
  })

  it('fails closed when a required installer extension is missing', () => {
    assert.throws(
      () => requireArtifacts(['/tmp/LumaRoute.dmg'], 'x86_64-unknown-linux-gnu'),
      /missing packaged installer/,
    )
    assert.throws(
      () => requireArtifacts(['/tmp/LumaRoute.msi'], 'x86_64-pc-windows-msvc'),
      /-setup\.exe/,
    )
    assert.deepEqual(requireArtifacts(['/tmp/LumaRoute.dmg'], 'aarch64-apple-darwin'), [
      '/tmp/LumaRoute.dmg',
    ])
  })
})
