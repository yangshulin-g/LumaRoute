import { expect, test, addServer } from './fixtures'

test('adds a second server from the sidebar and switches without restarting', async ({
  page,
  serverOne,
  serverTwo,
}) => {
  await addServer(page, serverOne)

  await page.getByTestId('add-server').click()
  await expect(page).toHaveURL(/\/onboarding\?mode=add$/)
  await page.getByTestId('onboarding-cancel').click()
  await expect(page.getByTestId('server-switcher')).toBeVisible()

  await page.getByTestId('add-server').click()
  await page.locator('select[name="kind"]').selectOption(serverTwo.kind)
  await page.locator('input[name="name"]').fill(serverTwo.name)
  await page.locator('input[name="baseUrl"]').fill(serverTwo.baseUrl)
  await page.locator('input[name="username"]').fill(serverTwo.username)
  await page.locator('input[name="password"]').fill(serverTwo.password)
  await page.getByRole('button', { name: '连接' }).click()

  const switcher = page.getByTestId('server-switcher')
  await expect(switcher.getByRole('button', { name: 'Server Two' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(page.locator('input[name="password"]')).toHaveCount(0)
  await switcher.getByRole('button', { name: 'Server One' }).click()
  await expect(switcher.getByRole('button', { name: 'Server One' })).toHaveAttribute(
    'aria-current',
    'true',
  )

  await page.getByRole('link', { name: '服务器设置' }).click()
  await expect(page.getByTestId('line-list')).toContainText('主线路')
  await expect(page.getByTestId('line-list')).not.toContainText('Primary')
})

test('re-authenticates after the server password changes', async ({
  page,
  serverOne,
  mediaServers,
}) => {
  await addServer(page, serverOne)
  mediaServers.serverOne.changePassword('rotated-password', 'token-one-rotated')

  await page.reload()
  await expect(page.getByTestId('home-error')).toBeVisible()
  await page.getByTestId('home-reauth').click()

  await expect(page.getByTestId('account-username')).toHaveText(serverOne.username)
  const password = page.locator('input[name="reauth-password"]')
  await password.fill(serverOne.password)
  await page.getByTestId('reauth-submit').click()
  await expect(page.getByTestId('reauth-error')).toHaveText(
    '密码错误或账号不可用。请确认服务端的新密码后重试。',
  )
  await expect(password).toHaveValue('')

  await password.fill('rotated-password')
  await page.getByTestId('reauth-submit').click()
  await expect(page.getByTestId('reauth-status')).toHaveText('已重新登录')
  await expect(password).toHaveCount(0)
  await expect(page.getByTestId('library-movies')).toBeVisible()
  expect(await page.content()).not.toContain('token-one-rotated')
})
