#!/usr/bin/env node
import fs from 'node:fs'
import net from 'node:net'

const endpoint = process.argv
  .find((arg) => arg.startsWith('--input-ipc-server='))
  ?.split('=')[1]
  ?? (() => {
    const index = process.argv.indexOf('--input-ipc-server')
    return index >= 0 ? process.argv[index + 1] : undefined
  })()

if (!endpoint) {
  process.stderr.write('missing --input-ipc-server\n')
  process.exit(2)
}

function attachSocket(socket) {
  socket.setEncoding('utf8')
  let buffer = ''
  let paused = false
  let timePos = 0
  const duration = 120

  socket.on('data', (chunk) => {
    buffer += chunk
    for (;;) {
      const newline = buffer.indexOf('\n')
      if (newline < 0) break
      const raw = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (!raw.trim()) continue
      const request = JSON.parse(raw)
      socket.write(`${JSON.stringify({ request_id: request.request_id, error: 'success' })}\n`)

      const command = request.command?.[0]
      if (command === 'loadfile') {
        const startOpt = request.command?.[3]
        if (typeof startOpt === 'string' && startOpt.startsWith('start=')) {
          timePos = Number(startOpt.slice('start='.length)) || 0
        } else if (startOpt && typeof startOpt === 'object' && startOpt.start != null) {
          timePos = Number(startOpt.start) || 0
        }
        // Emit duration before file-loaded so Started carries a known duration.
        socket.write(`{"event":"property-change","name":"duration","data":${duration}}\n`)
        socket.write('{"event":"file-loaded"}\n')
        socket.write(`{"event":"property-change","name":"time-pos","data":${timePos}}\n`)
      }

      if (command === 'set_property' && request.command?.[1] === 'pause') {
        paused = Boolean(request.command[2])
        socket.write(
          `${JSON.stringify({
            event: 'property-change',
            name: 'pause',
            data: paused,
          })}\n`,
        )
      }

      if (command === 'seek') {
        timePos = Number(request.command?.[1]) || 0
        socket.write(`${JSON.stringify({ event: 'seek', position: timePos })}\n`)
        socket.write(
          `${JSON.stringify({
            event: 'property-change',
            name: 'time-pos',
            data: timePos,
          })}\n`,
        )
      }

      if (command === 'stop') {
        socket.write(
          `${JSON.stringify({
            event: 'end-file',
            reason: 'stop',
          })}\n`,
        )
      }
    }
  })
}

const isPipe = endpoint.startsWith('\\\\.\\pipe\\') || endpoint.startsWith('//./pipe/')
if (!isPipe) {
  try {
    fs.unlinkSync(endpoint)
  } catch {
    // ignore missing socket
  }
}

const server = net.createServer(attachSocket)
server.listen(endpoint)

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  server.close(() => process.exit(0))
})
