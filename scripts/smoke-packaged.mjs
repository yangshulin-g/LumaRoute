#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyChecksumSibling } from './package-checksums.mjs'
import { currentRustTarget, loadManifest, sidecarPathForTarget } from './verify-mpv.mjs'

const ALPHA_WARNINGS = [
  'UNSIGNED OR UNNOTARIZED',
  'INTERNAL TECHNICAL VALIDATION ONLY',
  'OPERATING SYSTEM SECURITY WARNINGS MAY APPEAR',
  'NOT FOR PUBLIC END-USER DISTRIBUTION',
]

export function expectedExtensions(target) {
  if (target === 'x86_64-pc-windows-msvc') return ['.msi', '-setup.exe']
  if (target === 'x86_64-apple-darwin' || target === 'aarch64-apple-darwin') return ['.dmg']
  if (target === 'x86_64-unknown-linux-gnu') return ['.AppImage', '.deb']
  throw new Error(`unsupported package target: ${target}`)
}

export function validateAlphaMarker(text) {
  for (const line of ALPHA_WARNINGS) {
    if (!text.includes(line)) throw new Error(`missing Internal Alpha warning: ${line}`)
  }
}

export function requireArtifacts(files, target) {
  const artifacts = []
  for (const extension of expectedExtensions(target)) {
    const matches = files.filter((file) => file.endsWith(extension))
    if (matches.length === 0) {
      throw new Error(`missing packaged installer for ${target}: ${extension}`)
    }
    artifacts.push(...matches)
  }
  return [...new Set(artifacts)]
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--current-platform') {
      args['current-platform'] = true
      continue
    }
    if (token.startsWith('--')) {
      args[token.slice(2)] = argv[i + 1]
      i += 1
    } else {
      args._.push(token)
    }
  }
  return args
}

function walk(root) {
  const out = []
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    if (!existsSync(current)) continue
    for (const name of readdirSync(current)) {
      const path = join(current, name)
      const st = statSync(path)
      if (st.isDirectory()) stack.push(path)
      else out.push(path)
    }
  }
  return out
}

function smokeSidecar(target) {
  const manifest = loadManifest()
  const build = manifest.builds[target]
  if (!build) throw new Error(`missing lock entry: ${target}`)
  const sidecar = sidecarPathForTarget(target, build.executable)
  if (!existsSync(sidecar)) throw new Error(`sidecar missing: ${sidecar}`)
  const result = spawnSync(sidecar, ['--version'], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`sidecar --version failed: ${result.stderr || result.stdout}`)
  }
  console.log(`PASS sidecar smoke for ${target}`)
  console.log((result.stdout || result.stderr).trim().split('\n')[0])
}

function findAlphaMarker(targetDir) {
  const markerCandidates = [
    join(targetDir, 'release', 'UNSIGNED-DEVELOPMENT-BUILD.txt'),
    join(targetDir, 'UNSIGNED-DEVELOPMENT-BUILD.txt'),
  ]
  const marker = markerCandidates.find((path) => existsSync(path))
  if (!marker) throw new Error('missing UNSIGNED-DEVELOPMENT-BUILD.txt')
  return marker
}

export async function smokePackaged({ target, targetDir }) {
  smokeSidecar(target)
  if (!existsSync(targetDir)) {
    throw new Error(`missing package target directory: ${targetDir}`)
  }
  const artifacts = requireArtifacts(walk(targetDir), target)
  for (const artifact of artifacts) {
    await verifyChecksumSibling(artifact, targetDir)
    console.log(`PASS artifact present: ${artifact}`)
  }
  const marker = findAlphaMarker(targetDir)
  validateAlphaMarker(readFileSync(marker, 'utf8'))
  console.log('PASS unsigned development marker present')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const target = args['current-platform'] ? currentRustTarget() : args.target || currentRustTarget()
  const targetDir = resolve(args.dir || 'apps/desktop/src-tauri/target')
  await smokePackaged({ target, targetDir })
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
