import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ServerLine, ServerProfile } from '@lumaroute/core'
import { injectServices } from '../composition/inject-services'
import type { OnboardingInput } from '../composition/service-types'
import { useAppStore } from './app-store'
import { toLineStatusReason, type LineStatusState } from './line-status'

export const useServerStore = defineStore('servers', () => {
  const profiles = ref<readonly ServerProfile[]>([])
  const sensitiveLineIds = ref<readonly string[]>([])
  const onboardingResult = ref<{ serverName: string; serverId: string } | null>(null)
  const lineStatus = ref<LineStatusState>({ state: 'idle' })

  function replaceProfile(updated: ServerProfile): void {
    profiles.value = profiles.value.map((profile) =>
      profile.id === updated.id ? updated : profile,
    )
    if (!profiles.value.some((profile) => profile.id === updated.id)) {
      profiles.value = [...profiles.value, updated]
    }
  }

  function requireProfile(profileId: string): ServerProfile {
    const profile = profiles.value.find((entry) => entry.id === profileId)
    if (!profile) throw new Error(`Unknown server profile: ${profileId}`)
    return profile
  }

  async function addServer(
    input: OnboardingInput,
  ): Promise<{ serverName: string; serverId: string; id: string }> {
    const services = injectServices()
    const deviceId = await services.deviceIdentity.getOrCreate()
    const result = await services.originPolicy.withEphemeralOrigin(input.baseUrl, () =>
      services.login.addServer({ ...input, deviceId, appVersion: '0.1.0' }),
    )
    profiles.value = await services.refreshProfiles()
    const summary = {
      serverName: result.serverName,
      serverId: result.profile.serverId,
      id: result.profile.id,
    }
    onboardingResult.value = {
      serverName: summary.serverName,
      serverId: summary.serverId,
    }
    const app = useAppStore()
    await app.selectServer(result.profile.id)
    return summary
  }

  async function hydrate(): Promise<void> {
    const services = injectServices()
    profiles.value = await services.refreshProfiles()
    const preferences = await services.refreshPreferences()
    sensitiveLineIds.value = preferences.sensitiveLineIds
  }

  async function testAndAddLine(profileId: string, draft: ServerLine): Promise<void> {
    const services = injectServices()
    lineStatus.value = { state: 'testing' }
    try {
      const updated = await services.originPolicy.withEphemeralOrigin(draft.baseUrl, () =>
        services.lines.addLine(profileId, draft),
      )
      replaceProfile(updated)
      lineStatus.value = { state: 'success', lineId: draft.id }
    } catch (error) {
      lineStatus.value = {
        state: 'failure',
        reason: toLineStatusReason(error),
      }
      throw error
    }
  }

  async function setPreferredLine(profileId: string, lineId: string): Promise<void> {
    const services = injectServices()
    const profile = requireProfile(profileId)
    const updated = await services.catalog.updateLines(profileId, profile.lines, lineId)
    services.routes.markManualSelection(profileId, lineId)
    replaceProfile(updated)
  }

  async function updateLines(
    profileId: string,
    lines: ServerLine[],
    preferredLineId: string,
  ): Promise<void> {
    const services = injectServices()
    const updated = await services.catalog.updateLines(profileId, lines, preferredLineId)
    replaceProfile(updated)
  }

  async function renameServer(profileId: string, name: string): Promise<void> {
    const services = injectServices()
    const updated = await services.catalog.rename(profileId, name)
    replaceProfile(updated)
  }

  async function deleteServer(profileId: string): Promise<void> {
    const services = injectServices()
    const app = useAppStore()
    await services.catalog.remove(profileId)
    profiles.value = profiles.value.filter((profile) => profile.id !== profileId)
    if (app.activeServerId === profileId) {
      const replacement = profiles.value[0]?.id ?? null
      await app.selectServer(replacement)
    }
  }

  async function reorderServers(profileIds: readonly string[]): Promise<void> {
    const services = injectServices()
    await services.catalog.reorder(profileIds)
    const byId = new Map(profiles.value.map((profile) => [profile.id, profile]))
    profiles.value = profileIds.flatMap((id) => {
      const profile = byId.get(id)
      return profile ? [profile] : []
    })
  }

  async function setLineSensitive(lineId: string, sensitive: boolean): Promise<void> {
    const services = injectServices()
    const preferences = await services.storage.loadPreferences()
    const current = new Set(preferences.sensitiveLineIds)
    if (sensitive) current.add(lineId)
    else current.delete(lineId)
    const next = [...current]
    await services.storage.savePreferences({
      ...preferences,
      sensitiveLineIds: next,
    })
    sensitiveLineIds.value = next
    await services.refreshPreferences()
  }

  return {
    profiles,
    sensitiveLineIds,
    onboardingResult,
    lineStatus,
    addServer,
    hydrate,
    testAndAddLine,
    setPreferredLine,
    updateLines,
    renameServer,
    deleteServer,
    reorderServers,
    setLineSensitive,
  }
})
