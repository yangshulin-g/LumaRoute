import { describe, expect, it } from 'vitest'
import { onboardingErrorMessage } from './onboarding-error-message'

describe('onboardingErrorMessage', () => {
  it.each([
    [
      { code: 'AuthenticationExpired', message: 'Server credential was rejected' },
      'Authentication failed. Check the username and password.',
    ],
    [
      { status: 403, message: 'HTTP 403' },
      'Server rejected the request (HTTP 403). Check its access rules.',
    ],
    [
      { code: 'LineTimeout', message: 'Request timed out' },
      'Connection timed out. Check the server address and network.',
    ],
    [
      'invalid peer certificate: UnknownIssuer',
      'TLS certificate validation failed. Use a valid HTTPS certificate.',
    ],
    [
      'sql.execute not allowed. Permissions associated with this command: sql:allow-execute',
      'Unable to save the login securely. Check local storage and system keychain access.',
    ],
    [
      { message: 'sql.execute not allowed. Permissions associated with this command: sql:allow-execute' },
      'Unable to save the login securely. Check local storage and system keychain access.',
    ],
    [
      { code: 'NetworkUnavailable', message: 'Network request failed' },
      'Unable to reach the server. Check the address, DNS, proxy, and network.',
    ],
    [null, 'Unable to connect. Check the server address and try again.'],
    [{}, 'Unable to connect. Check the server address and try again.'],
  ])('maps %#', (failure, expected) => {
    expect(onboardingErrorMessage(failure)).toBe(expected)
  })
})
