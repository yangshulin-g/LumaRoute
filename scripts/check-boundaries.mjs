import { execFileSync } from 'node:child_process'

const forbidden = [
  ['packages/core', String.raw`from ['"](?:vue|pinia|@tauri-apps/|.*apps/desktop)`],
  ['packages/player', String.raw`from ['"](?:vue|pinia|@tauri-apps/|@lumaroute/core|.*apps/desktop)`],
]

let failed = false
for (const [path, pattern] of forbidden) {
  try {
    execFileSync('rg', ['-n', '--glob', '!**/node_modules/**', pattern, path], {
      stdio: 'inherit',
    })
    failed = true
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? error.status : undefined
    if (status !== 1) throw error
  }
}

if (failed) {
  console.error('Boundary violations found (see matches above).')
  process.exit(1)
}

console.log('Boundary check passed.')
