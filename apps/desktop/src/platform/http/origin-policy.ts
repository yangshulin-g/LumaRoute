export class OriginPolicy {
  private readonly ephemeral = new Map<string, number>()

  constructor(private readonly savedBaseUrls: () => readonly string[]) {}

  assertAllowed(baseUrl: string): void {
    const normalized = normalizeBaseUrl(baseUrl)
    const saved = this.savedBaseUrls().map(normalizeBaseUrl)
    if (!saved.includes(normalized) && !this.ephemeral.has(normalized)) {
      throw new Error('HTTP base URL is not an approved server line')
    }
  }

  async withEphemeralOrigin<T>(baseUrl: string, operation: () => Promise<T>): Promise<T> {
    const normalized = normalizeBaseUrl(baseUrl)
    this.ephemeral.set(normalized, (this.ephemeral.get(normalized) ?? 0) + 1)
    try {
      return await operation()
    } finally {
      const remaining = (this.ephemeral.get(normalized) ?? 1) - 1
      if (remaining === 0) this.ephemeral.delete(normalized)
      else this.ephemeral.set(normalized, remaining)
    }
  }
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}
