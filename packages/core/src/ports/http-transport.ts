export interface HttpRequest {
  baseUrl: string
  path: `/${string}`
  method: 'GET' | 'POST' | 'DELETE'
  query?: Readonly<Record<string, string | number | boolean | undefined>>
  headers?: Readonly<Record<string, string>>
  body?: unknown
  signal?: AbortSignal
  timeoutMs: number
  responseType?: 'json' | 'bytes'
}

export interface HttpResponse<T> {
  status: number
  headers: Readonly<Record<string, string>>
  data: T
}

export interface HttpTransport {
  request<T>(request: HttpRequest): Promise<HttpResponse<T>>
}
