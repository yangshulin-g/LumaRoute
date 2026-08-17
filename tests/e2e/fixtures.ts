import { test as base, expect, type Page } from '@playwright/test'
import {
  startTwoMockMediaServers,
  type LogicalServerFixture,
  type MediaServerFixtures,
} from './support/media-servers'

export type FakeMpvController = {
  advanceTo(seconds: number): Promise<void>
  close(): Promise<void>
}

export type ServerDraft = {
  name: string
  kind: 'jellyfin' | 'emby'
  baseUrl: string
  username: string
  password: string
  backup: { label: string; baseUrl: string; priority: number }
}

export async function addServer(page: Page, server: ServerDraft): Promise<void> {
  await page.goto('/onboarding')
  await page.locator('select[name="kind"]').selectOption(server.kind)
  await page.locator('input[name="name"]').fill(server.name)
  await page.locator('input[name="baseUrl"]').fill(server.baseUrl)
  await page.locator('input[name="username"]').fill(server.username)
  await page.locator('input[name="password"]').fill(server.password)
  await page.getByRole('button', { name: '连接' }).click()
  await expect(page.getByTestId('server-switcher')).toContainText(server.name)
}

export async function addValidatedLine(
  page: Page,
  backup: ServerDraft['backup'],
): Promise<void> {
  await page.getByRole('link', { name: '服务器设置' }).click()
  await page.locator('input[name="line-label"]').fill(backup.label)
  await page.locator('input[name="line-base-url"]').fill(backup.baseUrl)
  await page.locator('input[name="line-priority"]').fill(String(backup.priority))
  await page.getByTestId('add-line').click()
  await expect(page.getByTestId('line-list').locator('li')).toHaveCount(2)
}

function toDraft(server: LogicalServerFixture): ServerDraft {
  return {
    name: server.name,
    kind: 'jellyfin',
    baseUrl: server.primary.baseUrl,
    username: server.username,
    password: server.password,
    backup: {
      label: 'Backup',
      baseUrl: server.backup.baseUrl,
      priority: 1,
    },
  }
}

export const test = base.extend<{
  mediaServers: MediaServerFixtures
  fakeMpv: FakeMpvController
  serverOne: ServerDraft
  serverTwo: ServerDraft
  seedAuthenticatedProfiles: (page: Page) => Promise<void>
}>({
  mediaServers: async ({ browser: _browser }, use) => {
    void _browser
    const fixtures = await startTwoMockMediaServers()
    await use(fixtures)
    await fixtures.close()
  },
  fakeMpv: async ({ page }, use) => {
    const controller: FakeMpvController = {
      async advanceTo(seconds: number) {
        await page.evaluate(async (position) => {
          const control = window.__LUMAROUTE_E2E__
          if (!control) throw new Error('E2E control surface is unavailable')
          await control.player.advanceTo(position)
        }, seconds)
      },
      async close() {},
    }
    await use(controller)
  },
  serverOne: async ({ mediaServers }, use) => {
    await use(toDraft(mediaServers.serverOne))
  },
  serverTwo: async ({ mediaServers }, use) => {
    await use(toDraft(mediaServers.serverTwo))
  },
  seedAuthenticatedProfiles: async ({ mediaServers }, use) => {
    await use(async (page: Page) => {
      const one = toDraft(mediaServers.serverOne)
      const two = toDraft(mediaServers.serverTwo)
      await addServer(page, one)
      await addValidatedLine(page, one.backup)
      await addServer(page, two)
      await addValidatedLine(page, two.backup)
      await page.goto('/')
      await page.getByTestId('server-switcher').getByRole('button', { name: 'Server One' }).click()
    })
  },
})

export { expect }
