import { execFileSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import test from 'node:test'

const fixture = 'tests/fixtures/security/app.log.txt'

test('tracked security log fixture exists and passes the sensitive-output scanner', () => {
  accessSync(fixture, constants.R_OK)
  execFileSync(process.execPath, ['scripts/check-sensitive-output.mjs', fixture], {
    stdio: 'pipe',
  })
})
