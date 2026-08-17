import type { AppErrorCode } from '../errors/app-error'
import type { ServerProfile } from '../server/types'
import { redact, type RedactionPolicy } from './redact'

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error'

export interface DiagnosticRecord {
  level: DiagnosticLevel
  message: string
  code?: string
  context?: Readonly<Record<string, unknown>>
  at?: string
}

export interface DiagnosticEnvironment {
  platform: string
  appVersion: string
}

export type DiagnosticUserAction = 'switch line' | 'sign in again' | 'copy diagnostics'

export function userActionFor(code: AppErrorCode | string | undefined): DiagnosticUserAction {
  switch (code) {
    case 'NetworkUnavailable':
    case 'LineTimeout':
    case 'ServerMismatch':
      return 'switch line'
    case 'AuthenticationExpired':
      return 'sign in again'
    default:
      return 'copy diagnostics'
  }
}

export function sensitiveOriginsFrom(
  profiles: readonly ServerProfile[],
  sensitiveLineIds: readonly string[],
): string[] {
  const marked = new Set(sensitiveLineIds)
  const origins: string[] = []
  for (const profile of profiles) {
    for (const line of profile.lines) {
      if (marked.has(line.id)) origins.push(line.baseUrl)
    }
  }
  return origins
}

export interface CreateDiagnosticServiceOptions {
  sensitiveLineIds: readonly string[]
  profiles: readonly ServerProfile[]
  records: readonly DiagnosticRecord[]
  environment?: DiagnosticEnvironment
}

export class DiagnosticService {
  constructor(
    private readonly records: () => readonly DiagnosticRecord[],
    private readonly policy: () => RedactionPolicy,
    private readonly environment: () => DiagnosticEnvironment,
  ) {}

  copyableReport(): string {
    return JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        environment: this.environment(),
        records: redact(this.records().slice(-200), this.policy()),
      },
      null,
      2,
    )
  }
}

export function createDiagnosticService(
  options: CreateDiagnosticServiceOptions,
): DiagnosticService {
  return new DiagnosticService(
    () => options.records,
    () => ({
      sensitiveOrigins: sensitiveOriginsFrom(options.profiles, options.sensitiveLineIds),
    }),
    () =>
      options.environment ?? {
        platform: 'unknown',
        appVersion: '0.1.0',
      },
  )
}
