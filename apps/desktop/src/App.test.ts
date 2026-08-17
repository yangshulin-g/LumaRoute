import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { createAppRouter } from './router'

vi.mock('./stores/server-store', () => ({
  useServerStore: () => ({
    profiles: [],
    addServer: vi.fn().mockResolvedValue({
      id: 'profile-1',
      serverName: 'Home',
      serverId: 'server-a',
    }),
    reorderServers: vi.fn(),
    deleteServer: vi.fn(),
    renameServer: vi.fn(),
    testAndAddLine: vi.fn(),
    setPreferredLine: vi.fn(),
    updateLines: vi.fn(),
  }),
}))

vi.mock('./stores/app-store', () => ({
  useAppStore: () => ({
    activeServerId: null,
    selectServer: vi.fn(),
  }),
}))

describe('App', () => {
  it('renders onboarding as the initial shell', async () => {
    const router = createAppRouter()
    await router.push({ name: 'onboarding' })
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router],
      },
    })
    await router.isReady()
    await flushPromises()
    expect(wrapper.text()).toContain('LumaRoute')
    expect(wrapper.find('form').exists()).toBe(true)
  })
})
