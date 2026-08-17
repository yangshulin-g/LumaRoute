#!/usr/bin/env node
import { createHash } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'

async function sha256File(path) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

function walk(root) {
  const out = []
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    for (const name of readdirSync(current)) {
      const path = join(current, name)
      const st = statSync(path)
      if (st.isDirectory()) stack.push(path)
      else out.push(path)
    }
  }
  return out
}

function isPackageArtifact(path) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.sha256')) return false
  if (lower.endsWith('-setup.exe') || lower.endsWith('.msi')) return true
  if (lower.endsWith('.dmg') || lower.endsWith('.appimage') || lower.endsWith('.deb')) return true
  return false
}

async function main() {
  const rootArg = process.argv[2]
  if (!rootArg) throw new Error('usage: node scripts/package-checksums.mjs <target-dir>')
  const root = resolve(rootArg)
  if (!existsSync(root)) throw new Error(`missing directory: ${root}`)

  const bundleRoots = [join(root, 'release', 'bundle'), join(root, 'bundle'), root]
  const searchRoots = bundleRoots.filter((path) => existsSync(path))
  const artifacts = []
  for (const searchRoot of searchRoots) {
    for (const file of walk(searchRoot)) {
      if (isPackageArtifact(file)) artifacts.push(file)
    }
  }

  const unique = [...new Set(artifacts)]
  if (unique.length === 0) {
    console.warn('No package artifacts found; writing unsigned marker only.')
  }

  for (const artifact of unique) {
    const digest = await sha256File(artifact)
    const sibling = `${artifact}.sha256`
    writeFileSync(sibling, `${digest}  ${relative(root, artifact)}\n`)
    console.log(`wrote ${sibling}`)
  }

  const markerDir = existsSync(join(root, 'release')) ? join(root, 'release') : root
  mkdirSync(markerDir, { recursive: true })
  const marker = join(markerDir, 'UNSIGNED-DEVELOPMENT-BUILD.txt')
  writeFileSync(
    marker,
    [
      'LumaRoute development package',
      'This build is intentionally UNSIGNED.',
      'macOS public distribution requires Apple signing and notarization.',
      'Windows public distribution requires a code-signing certificate.',
      `generatedAt=${new Date().toISOString()}`,
      '',
    ].join('\n'),
  )
  console.log(`wrote ${marker}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
