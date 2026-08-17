import { onScopeDispose, readonly, ref, watch, type Ref } from 'vue'
import type { MediaItem } from '@lumaroute/core'
import { injectServices } from '../composition/inject-services'

export function useSecureImage(
  profileId: Ref<string>,
  item: Ref<MediaItem>,
  enabled: Ref<boolean> = ref(true),
): Readonly<Ref<string | null>> {
  const services = injectServices()
  const source = ref<string | null>(null)
  let controller: AbortController | null = null

  watch(
    [profileId, () => item.value.id, () => item.value.imageTag, enabled],
    async () => {
      controller?.abort()
      if (source.value) {
        services.images.release(source.value)
        source.value = null
      }
      if (!enabled.value || !item.value.imageTag) return
      controller = new AbortController()
      try {
        source.value = await services.images.load(
          profileId.value,
          item.value.id,
          item.value.imageTag,
          controller.signal,
        )
      } catch {
        if (!controller.signal.aborted) source.value = null
      }
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    controller?.abort()
    if (source.value) services.images.release(source.value)
  })

  return readonly(source)
}
