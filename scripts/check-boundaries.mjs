#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_FORBIDDEN = [
  ['packages/core', String.raw`from ['"](?:vue|pinia|@tauri-apps/|.*apps/desktop)`],
  ['packages/player', String.raw`from ['"](?:vue|pinia|@tauri-apps/|@lumaroute/core|.*apps/desktop)`],
]

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'target', 'coverage'])

function walkFiles(root, files = []) {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
    if (code === 'ENOENT') return files
    throw error
  }
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkFiles(full, files)
      continue
    }
    if (entry.isFile()) files.push(full)
  }
  return files
}

export function collectBoundaryViolations(forbidden = DEFAULT_FORBIDDEN) {
  const hits = []
  for (const [path, pattern] of forbidden) {
    const regex = new RegExp(pattern)
    for (const file of walkFiles(path)) {
      const text = readFileSync(file, 'utf8')
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        if (regex.test(line)) hits.push(`${file}:${index + 1}:${line}`)
      }
    }
  }
  return hits
}

export function checkBoundaries(forbidden = DEFAULT_FORBIDDEN) {
  const hits = collectBoundaryViolations(forbidden)
  if (hits.length) {
    console.error(hits.join('\n'))
    console.error('Boundary violations found (see matches above).')
    process.exit(1)
  }
  console.log('Boundary check passed.')
}

const invokedAsCli =
  Boolean(process.argv[1]) &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (invokedAsCli) {
  checkBoundaries()
}
