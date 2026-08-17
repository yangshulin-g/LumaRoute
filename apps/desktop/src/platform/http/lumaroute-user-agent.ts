/** Browser-compatible UA; openresty/WAF often rejects `tauri-plugin-http/*`. */
export const LUMAROUTE_USER_AGENT = 'Mozilla/5.0 (compatible; LumaRoute/0.1.0)'

/**
 * Flatten RequestInit headers to a plain name/value list without relying on
 * `Headers.get('user-agent')` alone, then force the LumaRoute UA.
 */
export function headersWithLumaRouteUserAgent(
  headers?: HeadersInit,
  userAgent: string = LUMAROUTE_USER_AGENT,
): Record<string, string> {
  const merged: Record<string, string> = {}
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      merged[key] = value
    })
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      merged[key] = String(value)
    }
  } else if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) merged[key] = String(value)
    }
  }
  const existing = Object.entries(merged).find(([key]) => key.toLowerCase() === 'user-agent')
  if (existing) delete merged[existing[0]]
  merged['User-Agent'] = userAgent
  return merged
}
