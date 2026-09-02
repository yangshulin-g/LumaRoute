import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  connectIpcWhenReady,
  createIpcEndpoint,
  installSidecarRuntime,
  loadManifest,
  openIpc,
  runIpcSmokeCommands,
  sendIpc,
  sha256File,
  validateManifest,
  verifyInstalledFixture,
} from './verify-mpv.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const IPC_TEST_TIMEOUT_MS = 250

async function withFakeIpc(onRequest, run, listenPath) {
  const dir = mkdtempSync(join(tmpdir(), 'lr-ipc-test-'))
  const socketPath =
    listenPath ??
    (process.platform === 'win32'
      ? `\\\\.\\pipe\\lumaroute-test-${randomUUID()}`
      : join(dir, 'mpv.sock'))
  const server = createServer((socket) => {
    socket.setEncoding('utf8')
    socket.on('error', () => {})
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk
      for (;;) {
        const newline = buffer.indexOf('\n')
        if (newline < 0) break
        const raw = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!raw.trim()) continue
        onRequest(socket, JSON.parse(raw))
      }
    })
  })
  await new Promise((resolve, reject) => {
    server.listen(socketPath, (error) => (error ? reject(error) : resolve()))
  })
  try {
    return await run(socketPath)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
}

function writeFakeIpc(socket, message) {
  if (socket.writable === false) return
  try {
    socket.write(`${JSON.stringify(message)}\n`)
  } catch (error) {
    if (!/EPIPE|ECONNRESET/i.test(String(error?.code ?? error?.message ?? error))) throw error
  }
}

function replySuccess(socket, request, extra = {}) {
  writeFakeIpc(socket, { request_id: request.request_id, error: 'success', ...extra })
}

function fixtureManifest() {
  const build = (extra = {}) => ({
    version: '0.41.0',
    sourceUrl: 'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-example.zip',
    sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    executable: 'mpv',
    licenses: [
      {
        id: 'mpv',
        path: 'resources/third-party/mpv-LICENSE.txt',
        sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ],
    ...extra,
  })

  return {
    schemaVersion: 1,
    builds: {
      'x86_64-pc-windows-msvc': build({
        sourceUrl:
          'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-x86_64-pc-windows-msvc.zip',
        executable: 'mpv.exe',
      }),
      'x86_64-apple-darwin': build({
        sourceUrl:
          'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-macos-15-intel.zip',
      }),
      'aarch64-apple-darwin': build({
        sourceUrl:
          'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-macos-15-arm.zip',
      }),
      'x86_64-unknown-linux-gnu': build({
        sourceUrl:
          'https://github.com/mpv-player/mpv/releases/download/v0.41.0/mpv-v0.41.0-x86_64-linux.tar.gz',
      }),
    },
  }
}

describe('mpv manifest', () => {
  it('requires four tested targets and immutable sha256 values', () => {
    const manifest = fixtureManifest()
    assert.doesNotThrow(() => validateManifest(manifest))
    delete manifest.builds['x86_64-unknown-linux-gnu']
    assert.throws(() => validateManifest(manifest), /missing target/)
  })

  it('rejects mutable URLs and malformed hashes', () => {
    const manifest = fixtureManifest()
    manifest.builds['x86_64-pc-windows-msvc'].sourceUrl = 'https://example.invalid/latest.zip'
    manifest.builds['x86_64-pc-windows-msvc'].sha256 = 'abc'
    assert.throws(() => validateManifest(manifest))
  })

  it('keeps committed license files as LF bytes matching the lockfile', async () => {
    const manifest = loadManifest()
    const seen = new Set()
    for (const build of Object.values(manifest.builds)) {
      for (const license of build.licenses) {
        const filePath = join(ROOT, 'apps/desktop/src-tauri', license.path)
        const bytes = readFileSync(filePath)
        assert.equal(bytes.includes(0x0d), false, `${license.path} must not contain CR`)
        assert.equal(await sha256File(filePath), license.sha256, license.path)
        seen.add(license.path)
      }
    }
    assert.ok(seen.size >= 2)
  })
})

describe('sidecar companion runtime', () => {
  it('keeps per-target lib snapshots so a later fetch does not clobber the first arch', () => {
    const bin = mkdtempSync(join(tmpdir(), 'lr-mpv-runtime-'))
    const armExtract = mkdtempSync(join(tmpdir(), 'lr-mpv-arm-'))
    const intelExtract = mkdtempSync(join(tmpdir(), 'lr-mpv-intel-'))
    try {
      mkdirSync(join(armExtract, 'lib'))
      mkdirSync(join(intelExtract, 'lib'))
      writeFileSync(join(armExtract, 'mpv'), 'arm-mpv')
      writeFileSync(join(armExtract, 'lib', 'libass.9.dylib'), 'arm64-lib')
      writeFileSync(join(intelExtract, 'mpv'), 'intel-mpv')
      writeFileSync(join(intelExtract, 'lib', 'libass.9.dylib'), 'x86_64-lib')

      const armSidecar = join(bin, 'mpv-aarch64-apple-darwin')
      const intelSidecar = join(bin, 'mpv-x86_64-apple-darwin')
      installSidecarRuntime({
        executable: join(armExtract, 'mpv'),
        sidecar: armSidecar,
        target: 'aarch64-apple-darwin',
      })
      installSidecarRuntime({
        executable: join(intelExtract, 'mpv'),
        sidecar: intelSidecar,
        target: 'x86_64-apple-darwin',
      })

      assert.equal(
        readFileSync(join(bin, 'aarch64-apple-darwin', 'lib', 'libass.9.dylib'), 'utf8'),
        'arm64-lib',
      )
      assert.equal(
        readFileSync(join(bin, 'x86_64-apple-darwin', 'lib', 'libass.9.dylib'), 'utf8'),
        'x86_64-lib',
      )
      assert.equal(readFileSync(join(bin, 'lib', 'libass.9.dylib'), 'utf8'), 'x86_64-lib')
      assert.equal(
        readFileSync(join(bin, 'aarch64-apple-darwin', 'mpv-aarch64-apple-darwin'), 'utf8'),
        'arm-mpv',
      )
    } finally {
      rmSync(bin, { recursive: true, force: true })
      rmSync(armExtract, { recursive: true, force: true })
      rmSync(intelExtract, { recursive: true, force: true })
    }
  })
})

describe('installed qualification', () => {
  it('requires all three controlled codecs for installed qualification', async () => {
    const calls = []
    await verifyInstalledFixture({
      fixtures: 'h264,h265,av1',
      probe: (label) => calls.push(label),
      ipc: () => calls.push('ipc'),
    })
    assert.deepEqual(calls, ['h264', 'h265', 'av1', 'ipc'])
  })

  it('fails when a selected codec or IPC smoke is skipped', async () => {
    await assert.rejects(
      verifyInstalledFixture({ fixtures: 'h264,h265', ipc: false }),
      /h264,h265,av1 and JSON IPC are required/,
    )
  })

  it('fails when required probe or ipc callbacks are missing', async () => {
    await assert.rejects(
      verifyInstalledFixture({ fixtures: 'h264,h265,av1' }),
      /h264,h265,av1 and JSON IPC are required/,
    )
    await assert.rejects(
      verifyInstalledFixture({
        fixtures: 'h264,h265,av1',
        requireIpc: true,
        probe: () => {},
        ipc: true,
      }),
      /h264,h265,av1 and JSON IPC are required/,
    )
  })
})

describe('JSON IPC command execution', { concurrency: 1 }, () => {
  it('does not throw when a fake IPC write hits a closed peer', () => {
    const socket = {
      write() {
        const error = new Error('write EPIPE')
        error.code = 'EPIPE'
        throw error
      },
    }
    assert.doesNotThrow(() => {
      replySuccess(socket, { request_id: 1 })
    })
  })

  it('does not treat an uncorrelated JSON line as command success', async () => {
    await withFakeIpc((socket) => {
      writeFakeIpc(socket, { event: 'unrelated' })
    }, async (socketPath) => {
      const session = await openIpc(socketPath, { timeoutMs: IPC_TEST_TIMEOUT_MS })
      try {
        await assert.rejects(
          sendIpc(session, { command: ['get_property', 'mpv-version'] }),
          /timeout|success|reply|request/i,
        )
      } finally {
        session.close()
      }
    })
  })

  it('rejects a command reply whose error is not success', async () => {
    await withFakeIpc((socket, request) => {
      writeFakeIpc(socket, { request_id: request.request_id, error: 'invalid parameter' })
    }, async (socketPath) => {
      const session = await openIpc(socketPath, { timeoutMs: IPC_TEST_TIMEOUT_MS })
      try {
        await assert.rejects(
          sendIpc(session, { command: ['get_property', 'mpv-version'] }),
          /success|failed/i,
        )
      } finally {
        session.close()
      }
    })
  })

  it('ignores success replies that do not match the request id', async () => {
    await withFakeIpc((socket, request) => {
      writeFakeIpc(socket, { request_id: Number(request.request_id) + 99, error: 'success' })
      writeFakeIpc(socket, { event: 'unrelated' })
    }, async (socketPath) => {
      const session = await openIpc(socketPath, { timeoutMs: IPC_TEST_TIMEOUT_MS })
      try {
        await assert.rejects(
          sendIpc(session, { command: ['get_property', 'mpv-version'] }),
          /timeout|success|reply|request/i,
        )
      } finally {
        session.close()
      }
    })
  })

  it('requires file-loaded after a successful loadfile reply', async () => {
    await withFakeIpc((socket, request) => {
      replySuccess(socket, request)
    }, async (socketPath) => {
      const session = await openIpc(socketPath, { timeoutMs: IPC_TEST_TIMEOUT_MS })
      try {
        await assert.rejects(
          runIpcSmokeCommands(session, ['/tmp/lumaroute-sample.mkv']),
          /file-loaded|timeout/i,
        )
      } finally {
        session.close()
      }
    })
  })

  it('requires pause, resume, seek, and end-file evidence after each command', async () => {
    await withFakeIpc((socket, request) => {
      replySuccess(socket, request)
      if (request.command?.[0] === 'loadfile') {
        writeFakeIpc(socket, { event: 'file-loaded' })
      }
    }, async (socketPath) => {
      const session = await openIpc(socketPath, { timeoutMs: IPC_TEST_TIMEOUT_MS })
      try {
        await assert.rejects(
          runIpcSmokeCommands(session, ['/tmp/lumaroute-sample.mkv']),
          /pause|resume|seek|end-file|timeout/i,
        )
      } finally {
        session.close()
      }
    })
  })

  it('accepts request-correlated success plus observed control events', async () => {
    let paused = false
    await withFakeIpc((socket, request) => {
      const [command, name, value] = request.command ?? []
      if (command === 'set_property' && name === 'pause') paused = value
      replySuccess(
        socket,
        request,
        command === 'get_property' && name === 'pause' ? { data: paused } : {},
      )
      if (command === 'loadfile') {
        writeFakeIpc(socket, { event: 'file-loaded' })
      }
      if (command === 'set_property' && name === 'pause') {
        writeFakeIpc(socket, { event: 'property-change', name: 'pause', data: paused })
      }
      if (command === 'seek') {
        writeFakeIpc(socket, { event: 'seek' })
      }
      if (command === 'stop') {
        writeFakeIpc(socket, { event: 'end-file', reason: 'stop' })
      }
    }, async (socketPath) => {
      const session = await openIpc(socketPath, { timeoutMs: IPC_TEST_TIMEOUT_MS })
      try {
        await runIpcSmokeCommands(session, ['/tmp/lumaroute-sample.mkv'])
      } finally {
        session.close()
      }
    })
  })

  it('keeps IPC failures category-only without headers or private URLs', async () => {
    const privateUrl = 'https://media.example/private.mkv?token=secret'
    await withFakeIpc((socket, request) => {
      if (request.command?.[0] === 'loadfile') {
        writeFakeIpc(socket, { request_id: request.request_id, error: 'invalid parameter' })
        return
      }
      replySuccess(socket, request)
    }, async (socketPath) => {
      const session = await openIpc(socketPath, { timeoutMs: IPC_TEST_TIMEOUT_MS })
      try {
        await assert.rejects(async () => {
          try {
            await runIpcSmokeCommands(session, [privateUrl])
          } catch (error) {
            const text = String(error?.message ?? error)
            assert.doesNotMatch(text, /token=secret|Authorization|https:\/\/media\.example/i)
            throw error
          }
        })
      } finally {
        session.close()
      }
    })
  })
})

describe('JSON IPC endpoint shape', () => {
  it('uses a named-pipe IPC endpoint for Windows targets and platforms', () => {
    const cases = [{ target: 'x86_64-pc-windows-msvc' }, { platform: 'win32' }]
    for (const input of cases) {
      const endpoint = createIpcEndpoint({ ...input, id: 'fixed-id', runtimeDir: '/tmp/unused' })
      assert.equal(endpoint.kind, 'pipe')
      assert.equal(endpoint.path, '\\\\.\\pipe\\lumaroute-mpv-fixed-id')
      assert.equal(existsSync(endpoint.path), false)
    }
  })

  it('uses a filesystem socket path for Unix targets and platforms', () => {
    const runtimeDir = '/tmp/lr-ipc-runtime'
    const cases = [
      { target: 'x86_64-apple-darwin' },
      { target: 'aarch64-apple-darwin' },
      { target: 'x86_64-unknown-linux-gnu' },
      { platform: 'darwin' },
      { platform: 'linux' },
      { target: 'x86_64-unknown-linux-gnu', platform: 'win32' },
      { target: 'aarch64-apple-darwin', platform: 'win32' },
    ]
    for (const input of cases) {
      const endpoint = createIpcEndpoint({ ...input, runtimeDir })
      assert.equal(endpoint.kind, 'socket', JSON.stringify(input))
      assert.equal(endpoint.path, join(runtimeDir, 'mpv.sock'))
    }
  })

  it('openIpc connects using a Unix socket endpoint from createIpcEndpoint', async (t) => {
    if (process.platform === 'win32') {
      t.skip('Windows runners cannot bind AF_UNIX sockets in TEMP')
      return
    }
    const dir = mkdtempSync(join(tmpdir(), 'lr-ipc-unix-'))
    const endpoint = createIpcEndpoint({ target: 'x86_64-unknown-linux-gnu', runtimeDir: dir })
    try {
      await withFakeIpc(
        (socket, request) => {
          replySuccess(socket, request, { data: 'mpv-test' })
        },
        async () => {
          const session = await openIpc(endpoint, { timeoutMs: IPC_TEST_TIMEOUT_MS })
          try {
            const reply = await sendIpc(session, { command: ['get_property', 'mpv-version'] })
            assert.equal(reply.error, 'success')
            assert.equal(reply.data, 'mpv-test')
          } finally {
            session.close()
          }
        },
        endpoint.path,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('openIpc connects using the named-pipe path, not a socket file', async () => {
    const endpoint = createIpcEndpoint({ platform: 'win32', id: 'smoke' })
    await withFakeIpc(
      (socket, request) => {
        replySuccess(socket, request, { data: 'ok' })
      },
      async (unixPath) => {
        const net = await import('node:net')
        let used
        const session = await openIpc(endpoint, {
          timeoutMs: IPC_TEST_TIMEOUT_MS,
          net: {
            createConnection(opts) {
              used = opts
              return net.createConnection(unixPath)
            },
          },
        })
        try {
          assert.deepEqual(used, { path: '\\\\.\\pipe\\lumaroute-mpv-smoke' })
          const reply = await sendIpc(session, { command: ['get_property', 'mpv-version'] })
          assert.equal(reply.error, 'success')
        } finally {
          session.close()
        }
      },
    )
  })

  it('fails closed when a Windows named pipe never accepts a connection', async () => {
    const endpoint = createIpcEndpoint({ platform: 'win32', id: 'never' })
    await assert.rejects(
      connectIpcWhenReady(endpoint, {
        timeoutMs: 80,
        net: {
          createConnection() {
            const sock = new EventEmitter()
            sock.setEncoding = () => {}
            sock.destroy = () => {}
            globalThis.queueMicrotask(() => {
              sock.emit('error', Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
            })
            return sock
          },
        },
      }),
      /ipc-connect|timeout/i,
    )
  })
})
