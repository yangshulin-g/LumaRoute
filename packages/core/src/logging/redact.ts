const SECRET_KEYS = /^(password|pw|token|access.?token|api.?key|authorization|x-emby-token)$/i
const SECRET_QUERY_KEYS = new Set(['api_key', 'token', 'access_token', 'x-emby-token'])

export interface RedactionPolicy {
  sensitiveOrigins: readonly string[]
}

export function redact(
  value: unknown,
  policy: RedactionPolicy,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'string') return redactString(value, policy)
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message, policy),
      cause: redact(value.cause, policy, seen),
    }
  }
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map((entry) => redact(entry, policy, seen))
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEYS.test(key) ? '[REDACTED]' : redact(entry, policy, seen),
    ]),
  )
}

function redactString(value: string, policy: RedactionPolicy): string {
  let output = value
  try {
    const url = new URL(output)
    const keys: string[] = []
    url.searchParams.forEach((_entry, key) => {
      keys.push(key)
    })
    for (const key of keys) {
      if (SECRET_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.set(key, '[REDACTED]')
    }
    output = url.toString()
  } catch {
    // non-URL strings keep going for origin replacement
  }
  for (const origin of policy.sensitiveOrigins) {
    output = output.replaceAll(origin, '[PRIVATE_SERVER]')
  }
  return output
}
