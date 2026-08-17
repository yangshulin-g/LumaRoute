import { computed, type Ref } from 'vue'
import { useInfiniteQuery } from '@tanstack/vue-query'
import type { ItemQuery } from '@lumaroute/core'
import { injectServices } from '../composition/inject-services'
import { useMediaStore } from '../stores/media-store'
import { mediaKeys } from './query-keys'

export function useLibraryItems(serverId: Ref<string>, query: Ref<ItemQuery>) {
  const services = injectServices()
  const mediaStore = useMediaStore()
  return useInfiniteQuery({
    queryKey: computed(() => mediaKeys.items(serverId.value, query.value)),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const result = await services.media.getItems(
        serverId.value,
        {
          ...query.value,
          startIndex: pageParam,
          limit: 60,
        },
        signal,
      )
      mediaStore.activeLineId = result.lineId
      return result.value
    },
    getNextPageParam: (lastPage) => {
      const next = lastPage.startIndex + lastPage.items.length
      return next < lastPage.total ? next : undefined
    },
  })
}
