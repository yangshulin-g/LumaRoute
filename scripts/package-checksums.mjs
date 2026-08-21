#!/usr/bin/env node
import { createHash } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'

export const ALPHA_MARKER_LINES = [
  'LumaRoute v0.1 Internal Alpha',
  'UNSIGNED OR UNNOTARIZED',
  'INTERNAL TECHNICAL VALIDATION ONLY',
  'OPERATING SYSTEM SECURITY WARNINGS MAY APPEAR',
  'NOT FOR PUBLIC END-USER DISTRIBUTION',
]

export async function sha256File(path) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

export async function writeChecksum(artifact, root) {
  const digest = await sha256File(artifact)
  const sibling = `${artifact}.sha256`
  writeFileSync(sibling, `${digest}  ${relative(root, artifact)}\n`)
  return sibling
}

export async function verifyChecksumSibling(artifact, root) {
  const sibling = `${artifact}.sha256`
  if (!existsSync(sibling)) throw new Error(`missing checksum sibling: ${sibling}`)
  const [recorded, relativeName] = readFileSync(sibling, 'utf8').trim().split(/\s{2,}/)
  if (relativeName !== relative(root, artifact)) throw new Error(`checksum path mismatch: ${artifact}`)
  const actual = await sha256File(artifact)
  if (recorded !== actual) throw new Error(`checksum mismatch: ${artifact}`)
}

export function writeAlphaMarker(markerDir) {
  mkdirSync(markerDir, { recursive: true })
  const marker = join(markerDir, 'UNSIGNED-DEVELOPMENT-BUILD.txt')
  writeFileSync(
    marker,
    [...ALPHA_MARKER_LINES, `generatedAt=${new Date().toISOString()}`, ''].join('\n'),
  )
  return marker
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
    throw new Error(`no package artifacts found under ${root}`)
  }

  for (const artifact of unique) {
    const sibling = await writeChecksum(artifact, root)
    console.log(`wrote ${sibling}`)
  }

  const markerDir = existsSync(join(root, 'release')) ? join(root, 'release') : root
  const marker = writeAlphaMarker(markerDir)
  console.log(`wrote ${marker}`)
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
