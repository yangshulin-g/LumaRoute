import { expect, test } from './fixtures'

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
