import { expect, test } from '@playwright/test'

import { mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'
import { AppShellPage } from '../pages/AppShellPage'
import { CatalogPage } from '../pages/CatalogPage'

test.describe('Navigation Layout', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('authenticated user can navigate Phase 2 shell sections', async ({ page }) => {
    const shell = new AppShellPage(page)
    const catalog = new CatalogPage(page)

    await page.goto('/')

    await expect(shell.shell).toBeVisible()
    await expect(catalog.gymsPage).toBeVisible()

    await shell.tasksNav.click()
    await expect(catalog.tasksPage).toBeVisible()

    await shell.modelsNav.click()
    await expect(catalog.modelsPage).toBeVisible()

    await shell.batchesNav.click()
    await expect(page.locator('[data-id="batches-page"]')).toBeVisible()

    await shell.adminNav.click()
    await expect(page.locator('[data-id="admin-page"]')).toBeVisible()
  })
})
