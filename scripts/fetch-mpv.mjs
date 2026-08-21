#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MPV_LOCK_PATH,
  companionRuntimeFiles,
  currentRustTarget,
  downloadToFile,
  extractArchive,
  findExecutable,
  loadManifest,
  sha256File,
  sidecarPathForTarget,
} from './verify-mpv.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token.startsWith('--')) {
      args[token.slice(2)] = argv[i + 1]
      i += 1
    } else {
      args._.push(token)
    }
  }
  return args
}

function copyPreservingRelative(sourceFile, sourceRoot, destinationRoot) {
  const rel = relative(sourceRoot, sourceFile)
  const dest = join(destinationRoot, rel)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(sourceFile, dest)
  return dest
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const target = args.target || currentRustTarget()
  const manifest = loadManifest(MPV_LOCK_PATH)
  const build = manifest.builds[target]
  if (!build) throw new Error(`missing target in mpv.lock.json: ${target}`)

  const cacheDir = join(tmpdir(), 'lumaroute-mpv-cache')
  mkdirSync(cacheDir, { recursive: true })
  const archiveName = basename(new URL(build.sourceUrl).pathname)
  const archivePath = join(cacheDir, `${target}-${archiveName}`)

  if (!existsSync(archivePath) || (await sha256File(archivePath)) !== build.sha256) {
    console.log(`Downloading mpv for ${target}...`)
    await downloadToFile(build.sourceUrl, archivePath)
  }

  const digest = await sha256File(archivePath)
  if (digest !== build.sha256) {
    throw new Error(`SHA-256 mismatch for ${target}: expected ${build.sha256}, got ${digest}`)
  }

  const work = mkdtempSync(join(tmpdir(), 'lumaroute-fetch-mpv-'))
  try {
    await extractArchive(archivePath, work)
    const preferred =
      build.executable || (target.includes('windows') ? 'mpv.exe' : 'mpv')
    let executable
    if (archiveName.toLowerCase().endsWith('.appimage')) {
      executable = join(work, basename(archivePath))
    } else {
      executable = findExecutable(work, preferred)
    }

    const sidecar = sidecarPathForTarget(target, preferred)
    mkdirSync(dirname(sidecar), { recursive: true })
    copyFileSync(executable, sidecar)
    if (!sidecar.endsWith('.exe')) {
      try {
        chmodSync(sidecar, 0o755)
      } catch {
        // ignore
      }
    }

    const runtimeRoot = dirname(sidecar)
    for (const companion of companionRuntimeFiles(executable)) {
      copyPreservingRelative(companion, dirname(executable), runtimeRoot)
    }

    if (target.includes('apple-darwin')) {
      // The upstream binary is signed as part of mpv.app and its signature
      // becomes invalid when Tauri extracts it as a standalone sidecar.
      execFileSync('codesign', ['--force', '--sign', '-', sidecar], { stdio: 'inherit' })
    }

    for (const license of build.licenses) {
      const dest = join(ROOT, 'apps/desktop/src-tauri', license.path)
      if (!existsSync(dest)) {
        throw new Error(`license file missing before package: ${license.path}`)
      }
      const licenseDigest = await sha256File(dest)
      if (licenseDigest !== license.sha256) {
        throw new Error(`license hash mismatch: ${license.path}`)
      }
    }

    console.log(`Fetched and verified mpv sidecar: ${sidecar}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
