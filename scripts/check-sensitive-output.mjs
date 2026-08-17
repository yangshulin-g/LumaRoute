import { readFileSync } from 'node:fs'

const files = process.argv.slice(2).filter((arg) => arg !== '--')
const forbidden = [
  /Bearer\s+[A-Za-z0-9._~-]{8,}/i,
  /(?:api_key|access_token|x-emby-token)=([^&\s[\]"]+)/i,
  /"(?:password|accessToken|token)"\s*:\s*"(?!\[REDACTED\])/i,
]

if (files.length === 0) {
  console.log('Sensitive-output check: no input files; skipping.')
  process.exit(0)
}

const findings = files.flatMap((file) => {
  const text = readFileSync(file, 'utf8')
  return forbidden.flatMap((pattern) => (pattern.test(text) ? [`${file}: ${pattern}`] : []))
})

if (findings.length) {
  console.error(findings.join('\n'))
  process.exit(1)
}

console.log(`Sensitive-output check passed (${files.length} file(s)).`)
