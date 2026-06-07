import { expect, test } from '@playwright/test'

import { mockGym, mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'
import { AdminPage } from '../pages/AdminPage'
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
    const admin = new AdminPage(page)

    await page.goto('/')

    await expect(shell.shell).toBeVisible()
    await expect(catalog.gymsPage).toBeVisible()
    await expect(page.locator('[data-id="nav-tasks"]')).toHaveCount(0)

    await catalog.gymTasksLink(mockGym.id).click()
    await expect(catalog.tasksPage).toBeVisible()

    await expect(shell.modelsNav).toHaveCount(0)

    await shell.batchesNav.click()
    await expect(page.locator('[data-id="batches-page"]')).toBeVisible()

    await shell.adminNav.click()
    await expect(admin.adminPage).toBeVisible()
    await expect(admin.adminTabs).toHaveClass(/harness-segmented-tabs/)
    await expect(admin.usersCard).toBeVisible()

    await admin.modelsTab.click()
    await expect(admin.modelsPage).toBeVisible()
  })

  test('legacy models route opens admin model registry', async ({ page }) => {
    const admin = new AdminPage(page)

    await page.goto('/models')

    await expect(admin.adminPage).toBeVisible()
    await expect(admin.modelsTab).toHaveAttribute('aria-selected', 'true')
    await expect(admin.modelsPage).toBeVisible()
  })
})
