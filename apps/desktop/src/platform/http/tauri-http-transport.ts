import { AppError, type HttpRequest, type HttpResponse, type HttpTransport } from '@lumaroute/core'
import { headersWithLumaRouteUserAgent } from './lumaroute-user-agent'
import type { OriginPolicy } from './origin-policy'

export class TauriHttpTransport implements HttpTransport {
  constructor(
    private readonly policy: OriginPolicy,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    this.policy.assertAllowed(request.baseUrl)
    const url = buildUrl(request)
    const { signal, dispose } = createRequestSignal(request.signal, request.timeoutMs)
    const init: RequestInit = {
      method: request.method,
      redirect: 'manual',
      signal,
      headers: headersWithLumaRouteUserAgent(request.headers),
    }
    if (request.body !== undefined) init.body = JSON.stringify(request.body)
    let response: Response
    try {
      response = await this.fetchImpl(url, init)
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new AppError('LineTimeout', 'Request timed out', error)
      }
      if (/certificate|unknownissuer|invalid peer|tls/i.test(errorMessage(error))) {
        throw new AppError('NetworkUnavailable', 'TLS certificate validation failed', error)
      }
      throw new AppError('NetworkUnavailable', 'Network request failed', error)
    } finally {
      dispose()
    }
    if (response.status >= 300 && response.status < 400) {
      throw new AppError('NetworkUnavailable', 'Cross-origin redirects are disabled')
    }
    const headers = Object.fromEntries(response.headers.entries())
    if (response.status >= 400) {
      return { status: response.status, headers, data: undefined as T }
    }
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

/** Abort on timeout/caller signal, but clear the timer after the request settles. */
function createRequestSignal(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new DOMException('Request timed out', 'TimeoutError'))
  }, timeoutMs)

  const onExternalAbort = () => {
    controller.abort(external?.reason)
  }
  if (external) {
    if (external.aborted) onExternalAbort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  }
}

function buildUrl(request: HttpRequest): URL {
  const url = new URL(`${request.baseUrl.replace(/\/+$/, '')}/${request.path.replace(/^\/+/, '')}`)
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

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message)
  }
  return ''
}
