import type { ServerLine, ServerProfile } from './types'

export function orderLines(
  profile: ServerProfile,
  stickyLineId: string | null,
): readonly ServerLine[] {
  const enabled = profile.lines.filter((line) => line.enabled)
  const rank = (line: ServerLine): [number, number, string] => [
    line.id === stickyLineId ? 0 : line.id === profile.preferredLineId ? 1 : 2,
    line.priority,
    line.id,
  ]
  return [...enabled].sort((a, b) => {
    const left = rank(a)
    const right = rank(b)
    return left[0] - right[0] || left[1] - right[1] || left[2].localeCompare(right[2])
  })
}
