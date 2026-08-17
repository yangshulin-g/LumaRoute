import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { ServerLine } from '@lumaroute/core'

export type Reply = {
  status?: number
  delayMs?: number
  body?: unknown
  fixture?: string
}

export type RecordedRequest = {
  method: string
  path: string
  headers: Readonly<Record<string, string | string[] | undefined>>
}

export type MockMediaServer = {
  baseUrl: string
  line(id: string, priority: number): ServerLine
  reply(pathname: string, reply: Reply): void
  requests(pathname?: string): readonly RecordedRequest[]
  lastProgress(): Promise<Record<string, unknown> | null>
  close(): Promise<void>
}

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures',
)

const SENSITIVE_HEADER = /authorization|token|cookie|api[_-]?key/i

async function loadFixture(fixture: string): Promise<unknown> {
  const raw = await readFile(path.join(FIXTURE_ROOT, fixture), 'utf8')
  return JSON.parse(raw) as unknown
}

function redactHeaders(
  headers: IncomingMessage['headers'],
): Record<string, string | string[] | undefined> {
  const redacted: Record<string, string | string[] | undefined> = {}
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = SENSITIVE_HEADER.test(key) ? '[redacted]' : value
  }
  return redacted
}

function matchPatternReply(routes: Map<string, Reply>, pathname: string): Reply | undefined {
  for (const [pattern, reply] of routes) {
    if (!pattern.includes('*')) continue
    const regex = new RegExp(`^${pattern.replace(/\*/g, '[^/]+')}$`)
    if (regex.test(pathname)) return reply
  }
  return undefined
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return undefined
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function listenOnRandomLoopbackPort(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to bind mock media server'))
        return
      }
      resolve(address.port)
    })
  })
}

export async function mockServer(): Promise<MockMediaServer> {
  const routes = new Map<string, Reply>()
  const recorded: RecordedRequest[] = []
  const progressBodies: Record<string, unknown>[] = []

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', '*')
      if (request.method === 'OPTIONS') {
        response.statusCode = 204
        response.end()
        return
      }

      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const body = await readBody(request)
      recorded.push({
        method: request.method ?? 'GET',
        path: url.pathname,
        headers: redactHeaders(request.headers),
      })

      if (
        url.pathname === '/Sessions/Playing' ||
        url.pathname === '/Sessions/Playing/Progress' ||
        url.pathname === '/Sessions/Playing/Stopped'
      ) {
        if (body && typeof body === 'object') {
          progressBodies.push(body as Record<string, unknown>)
        }
      }

      const reply = routes.get(url.pathname) ?? matchPatternReply(routes, url.pathname) ?? {
        status: 404,
        body: { message: 'not found' },
      }
      if (reply.delayMs) await delay(reply.delayMs)
      response.statusCode = reply.status ?? 200
      response.setHeader('content-type', 'application/json')
      const payload =
        reply.body !== undefined
          ? reply.body
          : reply.fixture
            ? await loadFixture(reply.fixture)
            : {}
      response.end(JSON.stringify(payload))
    } catch (error) {
      response.statusCode = 500
      response.end(
        JSON.stringify({
          message: error instanceof Error ? error.message : 'mock server failure',
        }),
      )
    }
  })

  const port = await listenOnRandomLoopbackPort(server)
  const baseUrl = `http://127.0.0.1:${port}`

  return {
    baseUrl,
    line(id, priority) {
      return {
        id,
        label: id,
        baseUrl,
        priority,
        enabled: true,
      }
    },
    reply(pathname, reply) {
      routes.set(pathname, reply)
    },
    requests(pathname) {
      return pathname ? recorded.filter((entry) => entry.path === pathname) : recorded
    },
    async lastProgress() {
      return progressBodies.at(-1) ?? null
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}
