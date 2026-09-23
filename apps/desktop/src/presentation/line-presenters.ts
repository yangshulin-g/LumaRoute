import type { ServerLine, ServerProfile } from '@lumaroute/core'

export function resolveLine(
  profile: ServerProfile | null,
  lineId: string | null,
): ServerLine | null {
  if (!profile || !lineId) return null
  return profile.lines.find((line) => line.id === lineId) ?? null
}

export function lineProtocol(line: ServerLine): 'HTTP' | 'HTTPS' | null {
  let protocol: string
  try {
    protocol = new URL(line.baseUrl).protocol
  } catch {
    return null
  }
  if (protocol === 'https:') return 'HTTPS'
  if (protocol === 'http:') return 'HTTP'
  return null
}

export function lineStateLabels(
  line: ServerLine,
  profile: ServerProfile,
  activeLineId: string | null,
): readonly string[] {
  const labels: string[] = []
  if (line.id === activeLineId) labels.push('当前线路')
  if (line.id === profile.preferredLineId) labels.push('首选线路')
  if (!line.enabled) labels.push('已禁用')
  return labels
}
