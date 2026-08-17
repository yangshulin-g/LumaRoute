import { AppError, type HttpRequest, type HttpResponse, type HttpTransport } from '@lumaroute/core'
import type { OriginPolicy } from '../http/origin-policy'

function buildUrl(request: HttpRequest): URL {
  const url = new URL(
    `${request.baseUrl.replace(/\/+$/, '')}/${request.path.replace(/^\/+/, '')}`,
  )
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true
  return /aborted|timeout/i.test(error.message)
}

/** Browser fetch transport for compile-time E2E composition (not used in production builds). */
export class BrowserHttpTransport implements HttpTransport {
  private readonly fetchImpl: typeof fetch

  constructor(
    private readonly policy: OriginPolicy,
    fetchImpl: typeof fetch = fetch.bind(globalThis),
  ) {
    this.fetchImpl = fetchImpl
  }

  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    this.policy.assertAllowed(request.baseUrl)
    const url = buildUrl(request)
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort(new DOMException('Request timed out', 'TimeoutError'))
    }, request.timeoutMs)
    const onExternalAbort = () => controller.abort(request.signal?.reason)
    if (request.signal) {
      if (request.signal.aborted) onExternalAbort()
      else request.signal.addEventListener('abort', onExternalAbort, { once: true })
    }

    const init: RequestInit = {
      method: request.method,
      redirect: 'manual',
      signal: controller.signal,
    }
    if (request.headers) init.headers = { ...request.headers }
    if (request.body !== undefined) init.body = JSON.stringify(request.body)

    let response: Response
    try {
      response = await this.fetchImpl(url, init)
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new AppError('LineTimeout', 'Request timed out', error)
      }
      const detail = error instanceof Error ? error.message : String(error)
      throw new AppError(
        'NetworkUnavailable',
        detail ? `Network request failed: ${detail}` : 'Network request failed',
        error,
      )
    } finally {
      clearTimeout(timer)
      request.signal?.removeEventListener('abort', onExternalAbort)
    }

    if (response.status >= 300 && response.status < 400) {
      throw new AppError('NetworkUnavailable', 'Cross-origin redirects are disabled')
    }

    const headers = Object.fromEntries(response.headers.entries())
    if (response.status === 204) {
      return { status: response.status, headers, data: undefined as T }
    }
    if (request.responseType === 'bytes') {
      return {
        status: response.status,
        headers,
        data: new Uint8Array(await response.arrayBuffer()) as T,
      }
    }
    return {
      status: response.status,
      headers,
      data: (await response.json()) as T,
    }
  }
}
