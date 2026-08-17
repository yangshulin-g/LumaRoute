import { defineStore } from 'pinia'
import { ref } from 'vue'
import { injectServices } from '../composition/inject-services'

export const useAppStore = defineStore('app', () => {
  const activeServerId = ref<string | null>(null)

  async function initialize(): Promise<void> {
    const services = injectServices()
    const preferences = await services.storage.loadPreferences()
    const profiles = await services.storage.listServerProfiles()
    activeServerId.value = profiles.some((profile) => profile.id === preferences.activeServerId)
      ? preferences.activeServerId
      : (profiles[0]?.id ?? null)
  }

  async function selectServer(profileId: string | null): Promise<void> {
    const services = injectServices()
    const previous = activeServerId.value
    if (previous === profileId) return
    if (previous) services.routes.clearSession(previous)
    await services.queryClient.cancelQueries({
      predicate: (query) => query.queryKey[1] === previous,
    })
    const preferences = await services.storage.loadPreferences()
    await services.storage.savePreferences({ ...preferences, activeServerId: profileId })
    activeServerId.value = profileId
  }

  return { activeServerId, initialize, selectServer }
})
