import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalizedLoaded,
  type Router,
} from 'vue-router'
import type { ServerLine } from '@lumaroute/core'
import type { OnboardingInput } from '../composition/service-types'
import AppShell from '../components/AppShell.vue'
import { injectServices } from '../composition/inject-services'
import HomeView from '../views/HomeView.vue'
import LibraryView from '../views/LibraryView.vue'
import MediaDetailView from '../views/MediaDetailView.vue'
import OnboardingView from '../views/OnboardingView.vue'
import SearchView from '../views/SearchView.vue'
import ServerSettingsView from '../views/ServerSettingsView.vue'
import { useAppStore } from '../stores/app-store'
import { useMediaStore } from '../stores/media-store'
import { useServerStore } from '../stores/server-store'

export function settingsProps(route?: Pick<RouteLocationNormalizedLoaded, 'query'>) {
  const serverStore = useServerStore()
  const appStore = useAppStore()
  const mediaStore = useMediaStore()
  const activeId = appStore.activeServerId
  const profile =
    serverStore.profiles.find((entry) => entry.id === activeId) ?? serverStore.profiles[0] ?? null

  return {
    profiles: serverStore.profiles,
    profile,
    activeServerId: activeId,
    reauthOpen: route?.query.reauth === '1',
    reauthenticate: (profileId: string, password: string) =>
      serverStore.reauthenticate(profileId, password),
    activeLineId:
      mediaStore.activeLineId &&
      profile?.lines.some((line) => line.id === mediaStore.activeLineId)
        ? mediaStore.activeLineId
        : null,
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
      const report = injectServices().diagnostics.copyableReport()
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard is unavailable')
      }
      await navigator.clipboard.writeText(report)
    },
    updateLines: (profileId: string, lines: ServerLine[], preferredLineId: string) =>
      serverStore.updateLines(profileId, lines, preferredLineId),
  }
}

export function onboardingProps(
  route: Pick<RouteLocationNormalizedLoaded, 'query'>,
  router: Pick<Router, 'replace' | 'back' | 'options'>,
) {
  const serverStore = useServerStore()
  const adding = route.query.mode === 'add' && serverStore.profiles.length > 0
  return {
    mode: adding ? ('add' as const) : ('first' as const),
    addServer: async (input: OnboardingInput) => {
      const result = await serverStore.addServer(input)
      await router.replace({ name: 'home' })
      return result
    },
    ...(adding
      ? {
          cancel: () => {
            if (typeof router.options.history.state.back === 'string') router.back()
            else void router.replace({ name: 'home' })
          },
        }
      : {}),
  }
}

function requireActiveServerId(): string {
  const appStore = useAppStore()
  return appStore.activeServerId ?? 'missing'
}

export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: '/onboarding',
        name: 'onboarding',
        component: OnboardingView,
        props: (route) => onboardingProps(route, router),
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

  router.beforeEach((to) => {
    if (to.name === 'onboarding') return true
    return useServerStore().profiles.length > 0 ? true : { name: 'onboarding' }
  })

  return router
}
