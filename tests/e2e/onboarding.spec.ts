import { expect, test, addServer, addValidatedLine } from './fixtures'

test('adds two logical servers with two validated lines each', async ({
  page,
  serverOne,
  serverTwo,
}) => {
  await addServer(page, serverOne)
  await addValidatedLine(page, serverOne.backup)
  await addServer(page, serverTwo)
  await addValidatedLine(page, serverTwo.backup)
  const switcher = page.getByTestId('server-switcher')
  await expect(switcher).toContainText('Server One')
  await expect(switcher).toContainText('Server Two')
  await expect(page.getByTestId('line-list').locator('li')).toHaveCount(2)
})
