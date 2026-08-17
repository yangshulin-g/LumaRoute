import { VueQueryPlugin } from '@tanstack/vue-query'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { provideServices } from './composition/inject-services'
import { createAppRouter } from './router'
import { useAppStore } from './stores/app-store'
import { usePlayerStore } from './stores/player-store'
import { useServerStore } from './stores/server-store'
import './styles.css'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  const pinia = createPinia()
  const router = createAppRouter()

  // Compile-time switch: never load Tauri composition into the E2E web bundle.
  const services =
    import.meta.env.VITE_E2E === '1'
      ? await (await import('./composition/create-e2e-services')).createE2EServices()
      : await (await import('./composition/create-services')).createServices()

  app.use(pinia)
  provideServices(app, services)

  const serverStore = useServerStore(pinia)
  const appStore = useAppStore(pinia)
  const playerStore = usePlayerStore(pinia)
  await serverStore.hydrate()
  await appStore.initialize()

  // Install router only after activeServerId is known so route props are not snapshotted as missing.
  app.use(router)
  app.use(VueQueryPlugin, { queryClient: services.queryClient })

  if (serverStore.profiles.length === 0) {
    await router.replace({ name: 'onboarding' })
  }

  if (import.meta.env.VITE_E2E === '1') {
    const { installE2EControl } = await import('./composition/create-e2e-services')
    installE2EControl(services, (profileId) => appStore.selectServer(profileId))
  } else {
    const { registerCloseHandler } = await import('./platform/lifecycle/register-close-handler')
    await registerCloseHandler(playerStore)
  }

  app.mount('#app')
}

void bootstrap()
