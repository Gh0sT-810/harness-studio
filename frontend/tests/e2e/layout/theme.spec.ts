import { expect, test } from '@playwright/test'

import { mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'
import { AppShellPage } from '../pages/AppShellPage'

test.describe('Theme Support', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
    await page.goto('/gyms')
  })

  test('toggles between light and dark root theme classes', async ({ page }) => {
    const shell = new AppShellPage(page)
    const html = page.locator('html')

    await expect(shell.themeToggle).toBeVisible()
    await expect(html).toHaveClass(/light/)

    await shell.toggleTheme()
    await expect(html).toHaveClass(/dark/)

    await shell.toggleTheme()
    await expect(html).toHaveClass(/light/)
  })
})
