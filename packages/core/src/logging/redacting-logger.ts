import type { Logger } from '../ports/logger'
import type { DiagnosticLevel, DiagnosticRecord } from './diagnostic-service'
import { redact, type RedactionPolicy } from './redact'

export interface RingBufferLogger extends Logger {
  records(): readonly DiagnosticRecord[]
  clear(): void
}

export function createRedactingLogger(
  policy: () => RedactionPolicy,
  sink?: (level: DiagnosticLevel, message: string, context?: unknown) => void,
  capacity = 200,
): RingBufferLogger {
  const buffer: DiagnosticRecord[] = []

  function write(
    level: DiagnosticLevel,
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ): void {
    const redactedMessage = String(redact(message, policy()))
    const redactedContext =
      context === undefined
        ? undefined
        : (redact(context, policy()) as Readonly<Record<string, unknown>>)
    const record: DiagnosticRecord = {
      level,
      message: redactedMessage,
      at: new Date().toISOString(),
      ...(redactedContext === undefined ? {} : { context: redactedContext }),
    }
    buffer.push(record)
    if (buffer.length > capacity) buffer.shift()
    sink?.(level, redactedMessage, redactedContext)
  }

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
    records: () => buffer,
    clear: () => {
      buffer.length = 0
    },
  }
}
