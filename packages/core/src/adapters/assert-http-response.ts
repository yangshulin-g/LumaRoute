import { AppError } from '../errors/app-error'
import type { HttpResponse } from '../ports/http-transport'

export function assertSuccessfulResponse(
  response: HttpResponse<unknown>,
  authenticationRequest = false,
): void {
  if (response.status < 400) return

  const failure = Object.assign(new Error(`HTTP ${response.status}`), {
    status: response.status,
  })
  if (authenticationRequest && (response.status === 401 || response.status === 403)) {
    throw new AppError('AuthenticationExpired', 'Server credential was rejected', failure)
  }
  throw failure
}
