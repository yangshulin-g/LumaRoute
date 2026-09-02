#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const MPV_LOCK_PATH = join(ROOT, 'apps/desktop/src-tauri/resources/mpv/mpv.lock.json')
export const SAMPLES_LOCK_PATH = join(ROOT, 'tests/fixtures/media/samples.lock.json')
export const THIRD_PARTY_DIR = join(ROOT, 'apps/desktop/src-tauri/resources/third-party')
export const BIN_DIR = join(ROOT, 'apps/desktop/src-tauri/resources/bin')

export const REQUIRED_TARGETS = [
  'x86_64-pc-windows-msvc',
  'x86_64-apple-darwin',
  'aarch64-apple-darwin',
  'x86_64-unknown-linux-gnu',
]

const SAMPLE_SPECS = [
  { name: 'h264', codec: 'h264' },
  { name: 'h265', codec: 'hevc' },
  { name: 'av1', codec: 'av1' },
]

export function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1) throw new Error('unsupported mpv manifest schema')
  if (!manifest.builds || typeof manifest.builds !== 'object') {
    throw new Error('missing builds')
  }
  for (const target of REQUIRED_TARGETS) {
    const build = manifest.builds[target]
    if (!build) throw new Error(`missing target: ${target}`)
    if (!/^[0-9a-f]{64}$/.test(build.sha256)) throw new Error(`invalid sha256: ${target}`)
    if (!build.version || !build.executable || !build.licenses?.length) {
      throw new Error(`incomplete build metadata: ${target}`)
    }
    const url = new URL(build.sourceUrl)
    if (/\/latest(?:[/.?]|$)/i.test(url.pathname)) throw new Error(`mutable source URL: ${target}`)
  }
}

export function validateSamplesLock(lock) {
  if (lock.schemaVersion !== 1) throw new Error('unsupported samples lock schema')
  if (!Array.isArray(lock.samples) || lock.samples.length !== 3) {
    throw new Error('samples lock must contain exactly three samples')
  }
  for (const [index, spec] of SAMPLE_SPECS.entries()) {
    const sample = lock.samples[index]
    if (!sample || sample.name !== spec.name || sample.codec !== spec.codec) {
      throw new Error(`invalid sample slot: expected ${spec.name}/${spec.codec}`)
    }
    if (!sample.sourceUrl || !sample.license) throw new Error(`incomplete sample: ${spec.name}`)
    if (!/^[0-9a-f]{64}$/.test(sample.sha256)) throw new Error(`invalid sample sha256: ${spec.name}`)
    const url = new URL(sample.sourceUrl)
    if (/\/latest(?:[/.?]|$)/i.test(url.pathname)) {
      throw new Error(`mutable sample URL: ${spec.name}`)
    }
  }
}

export async function sha256File(path) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

export function loadManifest(path = MPV_LOCK_PATH) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  validateManifest(manifest)
  return manifest
}

export function currentRustTarget() {
  const output = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
  const match = /^host:\s*(.+)$/m.exec(output)
  if (!match) throw new Error('unable to detect rustc host target')
  return match[1].trim()
}

export function sidecarPathForTarget(target, executableName = 'mpv') {
  const base = executableName.replace(/\.exe$/i, '')
  const suffix = process.platform === 'win32' || target.includes('windows') ? '.exe' : ''
  return join(BIN_DIR, `${base}-${target}${suffix}`)
}

export function parseVersion(text) {
  const match = /mpv\s+v?([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[^\s]+)?)/i.exec(text)
  if (!match) throw new Error(`unable to parse mpv version from: ${text.slice(0, 200)}`)
  return match[1]
}

export function compareVersions(a, b) {
  const pa = a.split(/[.-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part))
  const pb = b.split(/[.-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part))
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i += 1) {
    const left = pa[i] ?? 0
    const right = pb[i] ?? 0
    if (typeof left === 'number' && typeof right === 'number') {
      if (left !== right) return left < right ? -1 : 1
      continue
    }
    const ls = String(left)
    const rs = String(right)
    if (ls !== rs) return ls < rs ? -1 : 1
  }
  return 0
}

function assertSafeArchiveEntry(entryPath, destinationRoot) {
  const normalized = entryPath.replace(/\\/g, '/')
  if (normalized.includes('\0') || normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`archive path traversal rejected: ${entryPath}`)
  }
  const absolute = resolve(destinationRoot, normalized)
  const root = resolve(destinationRoot) + sep
  if (!absolute.startsWith(root) && absolute !== resolve(destinationRoot)) {
    throw new Error(`archive path escapes destination: ${entryPath}`)
  }
}

export function resolveFixtureUrl(url) {
  const parsed = new URL(url)
  if (parsed.protocol === 'lumaroute-fixture:') {
    const relativePath = decodeURIComponent(`${parsed.host}${parsed.pathname}`.replace(/^\/+/, ''))
    return join(ROOT, 'tests/fixtures', relativePath)
  }
  return null
}

export async function downloadToFile(url, destination) {
  const fixturePath = resolveFixtureUrl(url)
  if (fixturePath) {
    if (!existsSync(fixturePath)) throw new Error(`fixture missing: ${fixturePath}`)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(fixturePath, destination)
    return
  }
  const parsed = new URL(url)
  if (/\/latest(?:[/.?]|$)/i.test(parsed.pathname)) {
    throw new Error(`mutable source URL rejected: ${url}`)
  }
  mkdirSync(dirname(destination), { recursive: true })
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) {
    throw new Error(`download failed (${response.status}): ${url}`)
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination))
}

export async function extractArchive(archivePath, destination) {
  mkdirSync(destination, { recursive: true })
  const lower = archivePath.toLowerCase()
  if (lower.endsWith('.zip')) {
    execFileSync('unzip', ['-q', archivePath, '-d', destination], { stdio: 'inherit' })
  } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    execFileSync('tar', ['-xzf', archivePath, '-C', destination], { stdio: 'inherit' })
  } else if (lower.endsWith('.appimage')) {
    copyFileSync(archivePath, join(destination, basename(archivePath)))
    try {
      execFileSync('chmod', ['+x', join(destination, basename(archivePath))])
      execFileSync(join(destination, basename(archivePath)), ['--appimage-extract'], {
        cwd: destination,
        stdio: 'ignore',
      })
    } catch {
      // Non-Linux hosts cannot execute AppImages; leave the image for hash/license workflows.
    }
  } else {
    throw new Error(`unsupported archive type: ${archivePath}`)
  }

  // Official macOS CI zips wrap a nested mpv.tar.gz app bundle.
  for (const entry of walkFiles(destination)) {
    const name = basename(entry).toLowerCase()
    if (name === 'mpv.tar.gz' || name === 'mpv.tgz') {
      execFileSync('tar', ['-xzf', entry, '-C', destination], { stdio: 'inherit' })
    }
  }

  for (const entry of walkFiles(destination)) {
    assertSafeArchiveEntry(relative(destination, entry), destination)
  }
}

function walkFiles(root) {
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

export function findExecutable(extractedRoot, preferredName) {
  const files = walkFiles(extractedRoot)
  const ranked = []
  for (const path of files) {
    const name = basename(path)
    if (preferredName && name === preferredName) ranked.push([0, path])
    else if (name === 'mpv' || name === 'mpv.exe') ranked.push([1, path])
    else if (name.endsWith('.AppImage') && name.toLowerCase().includes('mpv')) ranked.push([2, path])
  }
  if (ranked.length === 0) throw new Error('mpv executable not found in archive')
  ranked.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length)
  // Prefer app bundle binary over any wrapper scripts.
  const appBundle = ranked.find(([, path]) => path.includes(`${sep}MacOS${sep}`))
  return (appBundle ?? ranked[0])[1]
}

export function companionRuntimeFiles(executablePath) {
  const files = []
  const dir = dirname(executablePath)
  const libDir = join(dir, 'lib')
  if (existsSync(libDir) && statSync(libDir).isDirectory()) {
    for (const file of walkFiles(libDir)) files.push(file)
  }
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (!statSync(path).isFile()) continue
    if (/\.(dll|dylib|so(?:\.\d+)*)$/i.test(name)) files.push(path)
  }
  return files
}

function copyPreservingRelative(sourceFile, sourceRoot, destinationRoot) {
  const rel = relative(sourceRoot, sourceFile)
  const dest = join(destinationRoot, rel)
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(sourceFile, dest)
  return dest
}

function copyDirectory(sourceDir, destinationDir) {
  mkdirSync(destinationDir, { recursive: true })
  for (const file of walkFiles(sourceDir)) {
    copyPreservingRelative(file, sourceDir, destinationDir)
  }
}

function markExecutable(path) {
  if (path.endsWith('.exe')) return
  try {
    chmodSync(path, 0o755)
  } catch {
    // Windows or a filesystem that rejects chmod.
  }
}

/**
 * Install a target-suffixed sidecar plus a per-target lib snapshot.
 * `bin/lib` is published from the snapshot so `@executable_path/lib` keeps working,
 * while earlier architectures remain in `bin/<target>/lib`.
 */
export function installSidecarRuntime({ executable, sidecar, target }) {
  const binDir = dirname(sidecar)
  const snapshotRoot = join(binDir, target)
  const snapshotSidecar = join(snapshotRoot, basename(sidecar))
  mkdirSync(binDir, { recursive: true })
  mkdirSync(snapshotRoot, { recursive: true })
  copyFileSync(executable, sidecar)
  copyFileSync(executable, snapshotSidecar)
  markExecutable(sidecar)
  markExecutable(snapshotSidecar)

  const snapshotLib = join(snapshotRoot, 'lib')
  rmSync(snapshotLib, { recursive: true, force: true })
  for (const companion of companionRuntimeFiles(executable)) {
    copyPreservingRelative(companion, dirname(executable), snapshotRoot)
  }

  const publishedLib = join(binDir, 'lib')
  rmSync(publishedLib, { recursive: true, force: true })
  if (existsSync(snapshotLib)) {
    copyDirectory(snapshotLib, publishedLib)
  }
}

function discoverLicenseFiles(extractedRoot) {
  const names = ['LICENSE', 'LICENSE.GPL', 'LICENSE.LGPL', 'Copyright', 'COPYING', 'ffmpeg-LICENSE']
  const found = []
  for (const file of walkFiles(extractedRoot)) {
    const base = basename(file)
    if (names.some((name) => base === name || base.toLowerCase().includes('license'))) {
      found.push(file)
    }
  }
  return found
}

function runCaptured(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  }
}

async function verifyInstalledBinary(target, executablePath, minimumVersion) {
  if (!existsSync(executablePath)) {
    throw new Error(`installed mpv missing for ${target}: ${executablePath}`)
  }
  const versionResult = runCaptured(executablePath, ['--version'])
  const combined = `${versionResult.stdout}\n${versionResult.stderr}`
  if (versionResult.status !== 0) {
    throw new Error(`mpv --version failed for ${target}: ${combined}`)
  }
  const version = parseVersion(combined)
  if (compareVersions(version, minimumVersion) < 0) {
    throw new Error(`mpv too old for ${target}: ${version} < ${minimumVersion}`)
  }
  return version
}

export function sampleName(pathOrName) {
  return basename(String(pathOrName)).replace(/\.[^.]+$/, '')
}

function fixtureNames(fixtures) {
  return String(fixtures || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export async function selectRequiredSamples(fixtures, lockPath = SAMPLES_LOCK_PATH) {
  const wanted = new Set(fixtureNames(fixtures))
  const all = await ensureSamplesDownloaded(lockPath)
  return all.filter((path) => wanted.has(sampleName(path)))
}

export async function verifyInstalledFixture({
  fixtures = 'h264,h265,av1',
  requireIpc,
  probe,
  ipc,
} = {}) {
  const names = fixtureNames(fixtures)
  const ipcRequired = requireIpc ?? ipc !== false
  if (names.join(',') !== 'h264,h265,av1' || !ipcRequired) {
    throw new Error('h264,h265,av1 and JSON IPC are required for Internal Alpha')
  }
  if (typeof probe !== 'function' || (ipcRequired && typeof ipc !== 'function')) {
    throw new Error('h264,h265,av1 and JSON IPC are required for Internal Alpha')
  }
  for (const name of names) {
    await probe(name)
  }
  await ipc()
}

class MpvIpcSession {
  constructor(socket, options = {}) {
    this.socket = socket
    this.timeoutMs = options.timeoutMs ?? 5_000
    this.buffer = ''
    this.nextId = 1
    this.seq = 0
    this.pending = new Map()
    this.events = []
    this.waiters = new Set()

    socket.setEncoding('utf8')
    socket.on('data', (chunk) => this.#push(chunk))
    socket.on('error', (error) => this.#failAll(error))
    socket.on('close', () => this.#failAll(new Error('ipc-connect')))
  }

  mark() {
    return this.seq
  }

  take(predicate) {
    const index = this.events.findIndex(predicate)
    if (index < 0) return null
    return this.events.splice(index, 1)[0]
  }

  send(payload) {
    const request_id = payload.request_id ?? this.nextId++
    const message = { ...payload, request_id }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request_id)
        reject(new Error('ipc timeout'))
      }, this.timeoutMs)
      this.pending.set(request_id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      this.socket.write(`${JSON.stringify(message)}\n`)
    })
  }

  waitFor(predicate, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter)
        reject(new Error(`timed out waiting for ${label}`))
      }, this.timeoutMs)
      const waiter = {
        fail: (error) => {
          clearTimeout(timer)
          reject(error)
        },
        trySettle: () => {
          try {
            const index = this.events.findIndex(predicate)
            if (index < 0) return false
            const event = this.events.splice(index, 1)[0]
            clearTimeout(timer)
            this.waiters.delete(waiter)
            resolve(event)
            return true
          } catch (error) {
            clearTimeout(timer)
            this.waiters.delete(waiter)
            reject(error)
            return true
          }
        },
      }
      this.waiters.add(waiter)
      waiter.trySettle()
    })
  }

  close() {
    this.#failAll(new Error('ipc-connect'))
    this.socket.destroy()
  }

  #push(chunk) {
    this.buffer += chunk
    let newline
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const raw = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (!raw) continue
      let message
      try {
        message = JSON.parse(raw)
      } catch {
        this.#failAll(new Error('ipc-failed'))
        return
      }
      this.#dispatch(message)
    }
  }

  #dispatch(message) {
    if (message.request_id != null && message.event == null) {
      const pending = this.pending.get(message.request_id)
      if (!pending) return
      this.pending.delete(message.request_id)
      if (message.error === 'success') pending.resolve(message)
      else pending.reject(new Error('ipc command failed'))
      return
    }
    if (message.event) {
      this.seq += 1
      this.events.push({ ...message, seq: this.seq })
      for (const waiter of this.waiters) waiter.trySettle()
    }
  }

  #failAll(error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    for (const waiter of this.waiters) waiter.fail(error)
    this.waiters.clear()
  }
}

export function createIpcEndpoint({
  target,
  platform = process.platform,
  runtimeDir,
  id,
} = {}) {
  const windows =
    typeof target === 'string' ? target.includes('windows') : platform === 'win32'
  const token = id ?? randomUUID()
  if (windows) {
    return { kind: 'pipe', path: `\\\\.\\pipe\\lumaroute-mpv-${token}` }
  }
  if (!runtimeDir) throw new Error('runtimeDir required for unix ipc')
  return { kind: 'socket', path: join(runtimeDir, 'mpv.sock') }
}

export function ipcEndpointPath(endpoint) {
  return typeof endpoint === 'string' ? endpoint : endpoint.path
}

export async function openIpc(endpoint, options = {}) {
  const net = options.net ?? (await import('node:net'))
  const timeoutMs = options.timeoutMs ?? 5_000
  const path = ipcEndpointPath(endpoint)
  const socket = net.createConnection({ path })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('ipc timeout'))
    }, timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve()
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
  return new MpvIpcSession(socket, { timeoutMs })
}

export async function connectIpcWhenReady(endpoint, options = {}) {
  const timeoutMs = options.timeoutMs ?? 5_000
  const start = Date.now()
  const path = ipcEndpointPath(endpoint)
  const kind =
    typeof endpoint === 'object' && endpoint.kind
      ? endpoint.kind
      : /^\\\\[.]\\pipe\\/i.test(path)
        ? 'pipe'
        : 'socket'
  let lastError
  while (Date.now() - start < timeoutMs) {
    if (kind === 'socket' && !existsSync(path)) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      continue
    }
    try {
      const remaining = Math.max(50, timeoutMs - (Date.now() - start))
      return await openIpc(endpoint, {
        ...options,
        timeoutMs: Math.min(250, remaining),
      })
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error('ipc-connect', lastError ? { cause: lastError } : undefined)
}

export async function sendIpc(session, payload) {
  if (typeof session?.send !== 'function') {
    throw new Error('JSON IPC requires one connected session')
  }
  return session.send(payload)
}

function isFileLoaded(event) {
  return event.event === 'file-loaded'
}

function isSeeked(event) {
  return event.event === 'seek' || event.event === 'playback-restart'
}

function isEndFile(event) {
  return event.event === 'end-file'
}

function isPauseObserved(paused) {
  return (event) =>
    event.event === 'property-change' && event.name === 'pause' && event.data === paused
}

async function expectCommand(session, payload, predicate, label) {
  const since = session.mark()
  await sendIpc(session, payload)
  await session.waitFor((event) => {
    if (event.seq <= since) return false
    if (label === 'file-loaded' && event.event === 'end-file' && event.reason === 'error') {
      throw new Error('decode-failed')
    }
    return predicate(event)
  }, label)
}

async function expectPause(session, paused) {
  const since = session.mark()
  await sendIpc(session, { command: ['set_property', 'pause', paused] })
  const label = paused ? 'pause' : 'resume'
  const deadline = Date.now() + session.timeoutMs
  while (Date.now() < deadline) {
    if (session.take((event) => event.seq > since && isPauseObserved(paused)(event))) {
      return
    }
    try {
      const reply = await sendIpc(session, { command: ['get_property', 'pause'] })
      if (reply.data === paused) return
    } catch {
      // Keep polling until the deadline; the public error stays category-only.
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`timed out waiting for ${label}`)
}

export async function runIpcSmokeCommands(session, samplePaths) {
  await sendIpc(session, { command: ['observe_property', 1, 'pause'] })
  await sendIpc(session, { command: ['observe_property', 2, 'time-pos'] })
  await sendIpc(session, { command: ['get_property', 'mpv-version'] })
  for (const sample of samplePaths) {
    await expectCommand(
      session,
      { command: ['loadfile', sample, 'replace'] },
      isFileLoaded,
      'file-loaded',
    )
    await expectPause(session, true)
    await expectPause(session, false)
    await expectCommand(session, { command: ['seek', 0, 'absolute'] }, isSeeked, 'seek')
    await expectCommand(session, { command: ['stop'] }, isEndFile, 'end-file')
  }
  try {
    await sendIpc(session, { command: ['quit'] })
  } catch (error) {
    const raw = String(error?.message ?? error)
    if (!/ipc-connect|EPIPE|ECONNRESET/i.test(raw)) throw error
  }
}

export async function probeSoftwareDecode(executable, samplePaths) {
  for (const sample of samplePaths) {
    const name = sampleName(sample)
    const probe = runCaptured(executable, [
      '--no-config',
      '--vo=null',
      '--ao=null',
      '--frames=1',
      '--quiet',
      sample,
    ])
    if (probe.status !== 0) {
      throw new Error(`${name} software decode failed`)
    }
    const label =
      name === 'h264' ? 'H.264' : name === 'h265' ? 'H.265' : name === 'av1' ? 'AV1' : name
    console.log(`PASS ${label} software decode`)
  }
}

function classifyIpcFailure(error) {
  const raw = String(error?.message ?? error)
  if (/sensitive|header/i.test(raw)) return 'header-leak'
  if (/timeout/i.test(raw)) return 'ipc-timeout'
  if (/ECONNREFUSED|ENOENT|EPIPE|connect/i.test(raw)) return 'ipc-connect'
  if (/decode|codec/i.test(raw)) return 'decode-failed'
  return 'ipc-failed'
}

function assertNoSensitiveLeak(text, surface) {
  if (/authorization|bearer|x-emby-token|token=/i.test(text)) {
    throw new Error(`sensitive headers leaked into ${surface}`)
  }
}

async function ipcSmoke(executable, samplePaths, options = {}) {
  const runtime = mkdtempSync(join(tmpdir(), 'lumaroute-mpv-ipc-'))
  const endpoint = createIpcEndpoint({
    runtimeDir: runtime,
    platform: process.platform,
    target: options.target,
  })
  const { spawn } = await import('node:child_process')
  const args = [
    '--idle=yes',
    '--force-window=no',
    '--no-terminal',
    '--vo=null',
    '--ao=null',
    `--input-ipc-server=${endpoint.path}`,
  ]
  assertNoSensitiveLeak(args.join(' '), 'process arguments')
  const proc = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  const logs = []
  proc.stdout.on('data', (chunk) => logs.push(String(chunk)))
  proc.stderr.on('data', (chunk) => logs.push(String(chunk)))

  try {
    const session = await connectIpcWhenReady(endpoint)
    try {
      await runIpcSmokeCommands(session, samplePaths)
    } finally {
      session.close()
    }
    const joined = logs.join('')
    assertNoSensitiveLeak(joined, 'logs')
    console.log('PASS JSON IPC startup/load/pause/seek/stop/end')
    console.log('PASS headers absent from process arguments and logs')
  } catch (error) {
    throw new Error(`JSON IPC failed: ${classifyIpcFailure(error)}`, { cause: error })
  } finally {
    if (!proc.killed) proc.kill('SIGKILL')
    rmSync(runtime, { recursive: true, force: true })
  }
}

async function ensureSamplesDownloaded(lockPath = SAMPLES_LOCK_PATH) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  validateSamplesLock(lock)
  const dir = join(dirname(lockPath), 'samples')
  mkdirSync(dir, { recursive: true })
  const paths = []
  for (const sample of lock.samples) {
    const dest = join(dir, `${sample.name}${extname(new URL(sample.sourceUrl).pathname) || '.mkv'}`)
    if (!existsSync(dest) || (await sha256File(dest)) !== sample.sha256) {
      await downloadToFile(sample.sourceUrl, dest)
      const digest = await sha256File(dest)
      if (digest !== sample.sha256) {
        throw new Error(`sample hash mismatch for ${sample.name}`)
      }
    }
    paths.push(dest)
  }
  return paths
}

export async function qualifyTarget({ target, archive, sourceUrl, fixtures }) {
  if (!REQUIRED_TARGETS.includes(target)) throw new Error(`unsupported target: ${target}`)
  if (!existsSync(archive)) throw new Error(`archive not found: ${archive}`)
  const digest = await sha256File(archive)
  const work = mkdtempSync(join(tmpdir(), 'lumaroute-qualify-'))
  try {
    await extractArchive(archive, work)
    const preferred = target.includes('windows') ? 'mpv.exe' : 'mpv'
    const executable = findExecutable(work, preferred)
    if (process.platform !== 'win32') {
      try {
        execFileSync('chmod', ['+x', executable])
      } catch {
        // ignore
      }
    }

    const versionResult = runCaptured(executable, ['--version'])
    if (versionResult.status !== 0) {
      throw new Error(`executable version check failed: ${versionResult.stderr || versionResult.stdout}`)
    }
    const version = parseVersion(`${versionResult.stdout}\n${versionResult.stderr}`)
    console.log('PASS executable version captured')

    const selected = await selectRequiredSamples(fixtures || 'h264,h265,av1')
    if (selected.length === 0) throw new Error('no fixtures selected for qualify')

    await probeSoftwareDecode(executable, selected)
    await ipcSmoke(executable, selected, { target })

    let licenseSources = discoverLicenseFiles(work)
    if (licenseSources.length === 0) {
      // Official CI binary archives often omit license texts; use the pinned
      // source-release copies already placed under resources/third-party/.
      for (const name of ['mpv-LICENSE.txt', 'ffmpeg-LICENSE.txt']) {
        const path = join(THIRD_PARTY_DIR, name)
        if (existsSync(path)) licenseSources.push(path)
      }
    }
    if (licenseSources.length === 0) {
      throw new Error('licenses not discovered in archive')
    }
    console.log('PASS licenses discovered')

    mkdirSync(THIRD_PARTY_DIR, { recursive: true })
    const licenses = []
    const ensureLicense = async (id, source) => {
      const destName = id === 'ffmpeg' ? 'ffmpeg-LICENSE.txt' : 'mpv-LICENSE.txt'
      const dest = join(THIRD_PARTY_DIR, destName)
      if (resolve(source) !== resolve(dest)) copyFileSync(source, dest)
      licenses.push({
        id,
        path: `resources/third-party/${destName}`,
        sha256: await sha256File(dest),
      })
    }

    let sawMpv = false
    let sawFfmpeg = false
    for (const source of licenseSources) {
      const base = basename(source)
      if (/ffmpeg/i.test(base)) {
        await ensureLicense('ffmpeg', source)
        sawFfmpeg = true
      } else {
        await ensureLicense('mpv', source)
        sawMpv = true
      }
    }
    if (!sawMpv && existsSync(join(THIRD_PARTY_DIR, 'mpv-LICENSE.txt'))) {
      await ensureLicense('mpv', join(THIRD_PARTY_DIR, 'mpv-LICENSE.txt'))
    }
    if (!sawFfmpeg && existsSync(join(THIRD_PARTY_DIR, 'ffmpeg-LICENSE.txt'))) {
      await ensureLicense('ffmpeg', join(THIRD_PARTY_DIR, 'ffmpeg-LICENSE.txt'))
    }
    if (!licenses.some((entry) => entry.id === 'mpv') || !licenses.some((entry) => entry.id === 'ffmpeg')) {
      throw new Error('mpv and ffmpeg license texts are both required')
    }

    console.log('PASS sha256 captured')

    const manifest = existsSync(MPV_LOCK_PATH)
      ? JSON.parse(readFileSync(MPV_LOCK_PATH, 'utf8'))
      : { schemaVersion: 1, builds: {} }
    manifest.schemaVersion = 1
    manifest.builds ??= {}
    manifest.builds[target] = {
      version,
      sourceUrl,
      sha256: digest,
      executable: basename(executable),
      licenses,
      qualificationStatus: 'qualified',
      qualifiedAt: new Date().toISOString(),
    }
    mkdirSync(dirname(MPV_LOCK_PATH), { recursive: true })
    writeFileSync(MPV_LOCK_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
    return manifest.builds[target]
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

export async function recordSamples(records) {
  if (records.length !== 3) throw new Error('exactly three samples required')
  const samples = []
  for (const [index, record] of records.entries()) {
    const spec = SAMPLE_SPECS[index]
    if (record.name !== spec.name || record.codec !== spec.codec) {
      throw new Error(`sample order mismatch at ${index}`)
    }
    const url = new URL(record.sourceUrl)
    if (/\/latest(?:[/.?]|$)/i.test(url.pathname)) {
      throw new Error(`mutable sample URL: ${record.name}`)
    }
    const temp = join(tmpdir(), `lumaroute-sample-${record.name}`)
    await downloadToFile(record.sourceUrl, temp)
    const digest = await sha256File(temp)
    samples.push({
      name: record.name,
      codec: record.codec,
      sourceUrl: record.sourceUrl,
      sha256: digest,
      license: record.license,
    })
    rmSync(temp, { force: true })
  }
  const lock = { schemaVersion: 1, samples }
  validateSamplesLock(lock)
  mkdirSync(dirname(SAMPLES_LOCK_PATH), { recursive: true })
  writeFileSync(SAMPLES_LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`)
  return lock
}

async function verifyLicenseHashes(build) {
  for (const license of build.licenses) {
    const path = join(ROOT, 'apps/desktop/src-tauri', license.path)
    if (!existsSync(path)) throw new Error(`missing license file: ${license.path}`)
    const digest = await sha256File(path)
    if (digest !== license.sha256) throw new Error(`license hash mismatch: ${license.path}`)
  }
}

export async function verifyInstalled(
  target = currentRustTarget(),
  options = { fixtures: 'h264,h265,av1', requireIpc: true },
) {
  const manifest = loadManifest()
  const build = manifest.builds[target]
  if (!build) throw new Error(`missing target: ${target}`)
  const sidecar = sidecarPathForTarget(target, build.executable)
  const version = await verifyInstalledBinary(target, sidecar, build.version)
  const selected = await selectRequiredSamples(options.fixtures)
  if (selected.map(sampleName).join(',') !== 'h264,h265,av1' || !options.requireIpc) {
    throw new Error('h264,h265,av1 and JSON IPC are required for Internal Alpha')
  }
  await verifyInstalledFixture({
    fixtures: selected.map(sampleName).join(','),
    requireIpc: options.requireIpc,
    probe: async (label) => {
      const sample = selected.find((path) => sampleName(path) === label)
      if (!sample) throw new Error(`${label} software decode failed`)
      await probeSoftwareDecode(sidecar, [sample])
    },
    ipc: () => ipcSmoke(sidecar, selected, { target }),
  })
  await verifyLicenseHashes(build)
  console.log(`PASS installed mpv qualification ${version} for ${target}`)
  return version
}

export function verifyLicenseFiles(manifest = loadManifest()) {
  for (const target of REQUIRED_TARGETS) {
    for (const license of manifest.builds[target].licenses) {
      const path = join(ROOT, 'apps/desktop/src-tauri', license.path)
      if (!existsSync(path)) throw new Error(`missing license file: ${license.path}`)
    }
  }
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const value = argv[i + 1]
      args[key] = value
      i += 1
    } else {
      args._.push(token)
    }
  }
  return args
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const command = args._[0]
  if (!command || command === 'manifest') {
    const manifest = loadManifest()
    verifyLicenseFiles(manifest)
    console.log('PASS mpv.lock.json manifest')
    return
  }
  if (command === 'installed') {
    await verifyInstalled(args.target || currentRustTarget(), {
      fixtures: args.fixtures || 'h264,h265,av1',
      requireIpc: args.ipc !== 'false',
    })
    return
  }
  if (command === 'qualify') {
    await qualifyTarget({
      target: args.target,
      archive: args.archive,
      sourceUrl: args['source-url'],
      fixtures: args.fixtures,
    })
    return
  }
  if (command === 'samples' && args._[1] === 'record') {
    // Usage: samples record --h264-url U --h265-url U --av1-url U --license CC0
    const license = args.license || 'CC0-1.0'
    await recordSamples([
      { name: 'h264', codec: 'h264', sourceUrl: args['h264-url'], license },
      { name: 'h265', codec: 'hevc', sourceUrl: args['h265-url'], license },
      { name: 'av1', codec: 'av1', sourceUrl: args['av1-url'], license },
    ])
    console.log('PASS samples.lock.json recorded')
    return
  }
  throw new Error(`unknown command: ${command}`)
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
