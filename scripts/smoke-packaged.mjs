#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { currentRustTarget, loadManifest, sidecarPathForTarget } from './verify-mpv.mjs'

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

function findArtifacts(targetDir, target) {
  const files = walk(targetDir)
  const wanted = []
  if (target.includes('windows')) {
    wanted.push(...files.filter((f) => f.endsWith('.msi') || f.endsWith('-setup.exe')))
  } else if (target.includes('apple-darwin')) {
    wanted.push(...files.filter((f) => f.endsWith('.dmg')))
  } else if (target.includes('linux')) {
    wanted.push(...files.filter((f) => f.endsWith('.AppImage') || f.endsWith('.deb')))
  }
  return [...new Set(wanted)]
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

function main() {
  const args = parseArgs(process.argv.slice(2))
  const target = args['current-platform'] ? currentRustTarget() : args.target || currentRustTarget()
  const targetDir = resolve(args.dir || 'apps/desktop/src-tauri/target')

  smokeSidecar(target)

  if (existsSync(targetDir)) {
    const artifacts = findArtifacts(targetDir, target)
    if (artifacts.length === 0) {
      console.warn(`No packaged installers found under ${targetDir}; sidecar smoke only.`)
    } else {
      for (const artifact of artifacts) {
        const sibling = `${artifact}.sha256`
        if (!existsSync(sibling)) {
          throw new Error(`missing checksum sibling: ${sibling}`)
        }
        console.log(`PASS artifact present: ${artifact}`)
      }
      const markerCandidates = [
        join(targetDir, 'release', 'UNSIGNED-DEVELOPMENT-BUILD.txt'),
        join(targetDir, 'UNSIGNED-DEVELOPMENT-BUILD.txt'),
      ]
      if (!markerCandidates.some((path) => existsSync(path))) {
        throw new Error('missing UNSIGNED-DEVELOPMENT-BUILD.txt')
      }
      console.log('PASS unsigned development marker present')
    }
  } else {
    console.warn(`Package target directory missing (${targetDir}); sidecar smoke only.`)
  }
}

main()
