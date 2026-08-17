/** Map login/onboarding failures to actionable UI copy. Accepts Error, AppError-like, and plain IPC rejects. */
export function onboardingErrorMessage(error: unknown): string {
  const code = errorField(error, 'code')
  const status = errorStatus(error)
  const detail = errorText(error)

  if (code === 'AuthenticationExpired' || status === 401) {
    return 'Authentication failed. Check the username and password.'
  }
  if (status === 403) {
    return 'Server rejected the request (HTTP 403). Check its access rules.'
  }
  if (code === 'LineTimeout' || /timed?\s*out|timeout/i.test(detail)) {
    return 'Connection timed out. Check the server address and network.'
  }
  if (/certificate|unknownissuer|invalid peer|tls/i.test(detail)) {
    return 'TLS certificate validation failed. Use a valid HTTPS certificate.'
  }
  if (
    code === 'StorageFailure' ||
    /sql\.execute not allowed|keychain|credential_/i.test(detail)
  ) {
    return 'Unable to save the login securely. Check local storage and system keychain access.'
  }
  if (code === 'NetworkUnavailable') {
    return 'Unable to reach the server. Check the address, DNS, proxy, and network.'
  }
  if (/not an approved server line/i.test(detail)) {
    return 'Server address is not allowed for this request. Check the URL and try again.'
  }
  if (status !== undefined) {
    return `Server returned HTTP ${status}.`
  }
  if (detail) {
    return `Unable to connect: ${detail}`
  }
  return 'Unable to connect. Check the server address and try again.'
}

function errorField(error: unknown, field: 'code' | 'message' | 'status' | 'cause'): unknown {
  if (typeof error !== 'object' || error === null || !(field in error)) return undefined
  return (error as Record<string, unknown>)[field]
}

function errorStatus(error: unknown): number | undefined {
  const status = errorField(error, 'status')
  if (typeof status === 'number') return status
  const cause = errorField(error, 'cause')
  return cause === undefined ? undefined : errorStatus(cause)
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) {
    return `${error.message} ${error.cause === undefined ? '' : errorText(error.cause)}`.trim()
  }
  const message = errorField(error, 'message')
  const cause = errorField(error, 'cause')
  return [typeof message === 'string' ? message : '', cause === undefined ? '' : errorText(cause)]
    .filter(Boolean)
    .join(' ')
}
