import { createRouter, createWebHistory, useRouter } from 'vue-router'
import type { ServerLine } from '@lumaroute/core'
import AppShell from '../components/AppShell.vue'
import { injectServices } from '../composition/inject-services'
import HomeView from '../views/HomeView.vue'
import LibraryView from '../views/LibraryView.vue'
import MediaDetailView from '../views/MediaDetailView.vue'
import OnboardingView from '../views/OnboardingView.vue'
import SearchView from '../views/SearchView.vue'
import ServerSettingsView from '../views/ServerSettingsView.vue'
import { useAppStore } from '../stores/app-store'
import { useServerStore } from '../stores/server-store'

function settingsProps() {
  const serverStore = useServerStore()
  const appStore = useAppStore()
  const activeId = appStore.activeServerId
  const profile =
    serverStore.profiles.find((entry) => entry.id === activeId) ?? serverStore.profiles[0]

  return {
    profiles: serverStore.profiles,
    profile: profile ?? {
      id: 'missing',
      name: 'No server',
      kind: 'jellyfin' as const,
      serverId: '',
      userId: '',
      username: '',
      credentialKey: '',
      preferredLineId: '',
      lines: [] as ServerLine[],
    },
    activeServerId: activeId,
    activeLineId: profile?.preferredLineId ?? null,
    sensitiveLineIds: serverStore.sensitiveLineIds,
    diagnosticReport: (() => {
      try {
        return injectServices().diagnostics.copyableReport()
      } catch {
        return undefined
      }
    })(),
    selectServer: (profileId: string) => appStore.selectServer(profileId),
    reorderServers: (profileIds: readonly string[]) => serverStore.reorderServers(profileIds),
    deleteServer: (profileId: string) => serverStore.deleteServer(profileId),
    renameServer: (profileId: string, name: string) => serverStore.renameServer(profileId, name),
    addLine: (draft: ServerLine) => {
      if (!profile) return Promise.resolve()
      return serverStore.testAndAddLine(profile.id, draft)
    },
    setPreferredLine: (profileId: string, lineId: string) =>
      serverStore.setPreferredLine(profileId, lineId),
    setLineSensitive: (lineId: string, sensitive: boolean) =>
      serverStore.setLineSensitive(lineId, sensitive),
    copyDiagnostics: async () => {
      try {
        const report = injectServices().diagnostics.copyableReport()
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(report)
        }
      } catch {
        // composition root may be unavailable in isolated tests
      }
    },
    updateLines: (profileId: string, lines: ServerLine[], preferredLineId: string) =>
      serverStore.updateLines(profileId, lines, preferredLineId),
  }
}

function requireActiveServerId(): string {
  const appStore = useAppStore()
  return appStore.activeServerId ?? 'missing'
}

export function createAppRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: '/onboarding',
        name: 'onboarding',
        component: OnboardingView,
        props: () => {
          const router = useRouter()
          return {
            addServer: async (
              input: Parameters<ReturnType<typeof useServerStore>['addServer']>[0],
            ) => {
              const result = await useServerStore().addServer(input)
              await router.replace({ name: 'home' })
              return result
            },
          }
        },
      },
      {
        path: '/',
        component: AppShell,
        children: [
          {
            path: '',
            name: 'home',
            component: HomeView,
            props: () => ({
              activeServerId: requireActiveServerId(),
            }),
          },
          {
            path: 'library/:libraryId',
            name: 'library',
            component: LibraryView,
            props: (route) => ({
              serverId: requireActiveServerId(),
              libraryId: String(route.params.libraryId),
            }),
          },
          {
            path: 'search',
            name: 'search',
            component: SearchView,
            props: () => ({
              activeServerId: requireActiveServerId(),
            }),
          },
          {
            path: 'media/:itemId',
            name: 'media',
            component: MediaDetailView,
            props: (route) => ({
              serverId: requireActiveServerId(),
              itemId: String(route.params.itemId),
            }),
          },
          {
            path: 'settings',
            name: 'settings',
            component: ServerSettingsView,
            props: settingsProps,
          },
        ],
      },
    ],
  })
}
