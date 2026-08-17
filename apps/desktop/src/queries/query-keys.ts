import type { ItemQuery } from '@lumaroute/core'

export const mediaKeys = {
  root: (serverId: string) => ['media', serverId] as const,
  items: (serverId: string, query: ItemQuery) =>
    ['media', serverId, 'items', structuredClone(query)] as const,
  image: (serverId: string, itemId: string, imageTag: string | null) =>
    ['media', serverId, 'image', itemId, imageTag] as const,
}
