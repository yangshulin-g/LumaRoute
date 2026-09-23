import { expect, test } from './fixtures'
import { SERVER_TWO_ONLY_TITLE } from './support/media-servers'

test('browses, searches, starts playback, and shows progress', async ({
  page,
  seedAuthenticatedProfiles,
  fakeMpv,
  mediaServers,
}) => {
  await seedAuthenticatedProfiles(page)
  await page.getByTestId('library-movies').click()
  await expect(page.getByTestId('media-card').first()).toBeVisible()
  await page.getByRole('searchbox').first().fill('Arrival')
  await page.getByTestId('media-card').filter({ hasText: 'Arrival' }).click()
  await page.getByTestId('play').click()
  await expect(page.getByTestId('player-state')).toHaveText('播放中')
  await fakeMpv.advanceTo(12)
  await expect.poll(async () => mediaServers.lastProgress()).toMatchObject({
    PositionTicks: 120_000_000,
  })
})

test('uses the Aurora shell without widening current-server scope', async ({
  page,
  seedAuthenticatedProfiles,
}) => {
  await seedAuthenticatedProfiles(page)

  await page.keyboard.press('Control+K')
  const search = page.getByTestId('current-server-search')
  await expect(search).toBeFocused()
  await expect(search).toHaveAttribute('placeholder', '搜索当前服务器')

  await page.getByTestId('library-movies').click()
  await expect(page.getByTestId('media-card').first()).toBeVisible()
  const posters = page.locator('[data-testid="media-card"] img')
  await expect(posters.first()).toBeVisible()
  const posterSources = await posters.evaluateAll((images) =>
    images.map((image) => image.getAttribute('src') ?? ''),
  )
  expect(posterSources.length).toBeGreaterThan(0)
  expect(posterSources.every((source) => source.startsWith('blob:'))).toBe(true)
  expect(posterSources.join(' ')).not.toMatch(/token|api_key|X-Emby-Token/i)
})

test('keeps search scoped to the active server', async ({ page, seedAuthenticatedProfiles }) => {
  await seedAuthenticatedProfiles(page)
  const search = page.getByTestId('current-server-search')
  const cards = page.getByTestId('media-card')

  await search.fill(SERVER_TWO_ONLY_TITLE)
  await expect(page.getByTestId('search-no-results')).toBeVisible()
  await expect(cards.filter({ hasText: SERVER_TWO_ONLY_TITLE })).toHaveCount(0)

  await search.fill('Arrival')
  await expect(cards.filter({ hasText: 'Arrival' })).toBeVisible()

  await page.getByTestId('server-switcher').getByRole('button', { name: 'Server Two' }).click()
  await search.fill(SERVER_TWO_ONLY_TITLE)
  await expect(cards.filter({ hasText: SERVER_TWO_ONLY_TITLE })).toBeVisible()
})
