import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { collectBoundaryViolations } from './check-boundaries.mjs'

const vueImportPattern = String.raw`from ['"](?:vue|pinia|@tauri-apps/|.*apps/desktop)`

test('CLI succeeds without a system rg binary', () => {
  const emptyPath = mkdtempSync(join(tmpdir(), 'lr-no-rg-'))
  try {
    const output = execFileSync(process.execPath, ['scripts/check-boundaries.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: emptyPath },
    })
    assert.match(output, /Boundary check passed/)
  } finally {
    rmSync(emptyPath, { recursive: true, force: true })
  }
})

test('detects a vue import in a scanned tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'lr-bound-bad-'))
  try {
    writeFileSync(join(root, 'bad.ts'), "import x from 'vue'\n")
    const hits = collectBoundaryViolations([[root, vueImportPattern]])
    assert.ok(hits.some((hit) => hit.includes('bad.ts')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('passes a tree without forbidden imports', () => {
  const root = mkdtempSync(join(tmpdir(), 'lr-bound-ok-'))
  try {
    writeFileSync(join(root, 'ok.ts'), "import x from './local'\n")
    assert.deepEqual(collectBoundaryViolations([[root, vueImportPattern]]), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
