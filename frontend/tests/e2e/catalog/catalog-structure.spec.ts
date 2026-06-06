import { expect, test } from '@playwright/test'

import { mockGym, mockModel, mockPhase2Api, mockTask, seedAuthenticatedState } from '../helpers/mock-api'
import { AppShellPage } from '../pages/AppShellPage'
import { CatalogPage } from '../pages/CatalogPage'

test.describe('Catalog Screens', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('renders gyms, tasks, and real model registry data', async ({ page }) => {
    const shell = new AppShellPage(page)
    const catalog = new CatalogPage(page)

    await page.goto('/gyms')
    await expect(catalog.gymsPage).toBeVisible()
    await expect(catalog.gymCard(mockGym.id)).toBeVisible()

    await shell.tasksNav.click()
    await expect(catalog.tasksPage).toBeVisible()
    await expect(catalog.taskCard(mockTask.id)).toBeVisible()

    await shell.modelsNav.click()
    await expect(catalog.modelsPage).toBeVisible()
    await expect(catalog.modelCard(mockModel.id)).toBeVisible()
  })
})
