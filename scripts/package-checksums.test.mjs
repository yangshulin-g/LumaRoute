import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { verifyChecksumSibling, writeChecksum } from './package-checksums.mjs'

const root = mkdtempSync(join(tmpdir(), 'lr-checksum-'))

async function fixtureArtifact(content, name = 'LumaRoute-alpha.dmg') {
  const artifact = join(root, name)
  await writeFile(artifact, content)
  return artifact
}

after(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('package checksums', () => {
  it('verifies a sibling checksum against artifact bytes', async () => {
    const artifact = await fixtureArtifact('alpha')
    await writeChecksum(artifact, root)
    await assert.doesNotReject(() => verifyChecksumSibling(artifact, root))
    await writeFile(artifact, 'changed')
    await assert.rejects(() => verifyChecksumSibling(artifact, root), /checksum mismatch/)
  })

  it('rejects a missing checksum sibling', async () => {
    const artifact = await fixtureArtifact('orphan', 'orphan.dmg')
    await assert.rejects(() => verifyChecksumSibling(artifact, root), /missing checksum sibling/)
  })

  it('rejects a checksum whose path does not match the artifact', async () => {
    const artifact = await fixtureArtifact('path', 'path.dmg')
    await writeFile(`${artifact}.sha256`, 'deadbeef  other.dmg\n')
    await assert.rejects(() => verifyChecksumSibling(artifact, root), /checksum path mismatch/)
  })
})
