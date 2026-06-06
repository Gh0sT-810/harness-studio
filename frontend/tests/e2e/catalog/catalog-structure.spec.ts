import { expect, test } from '@playwright/test'

import { mockGym, mockModel, mockPhase2Api, mockTask, seedAuthenticatedState } from '../helpers/mock-api'
import { AdminPage } from '../pages/AdminPage'
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
    const admin = new AdminPage(page)

    await page.goto('/gyms')
    await expect(catalog.gymsPage).toBeVisible()
    await expect(catalog.addGymButton).toBeVisible()
    await expect(catalog.gymFormCard).not.toBeVisible()
    await catalog.addGymButton.click()
    await expect(catalog.gymFormCard).toBeVisible()
    await expect(catalog.gymCard(mockGym.id)).toBeVisible()

    await shell.tasksNav.click()
    await expect(catalog.tasksPage).toBeVisible()
    await expect(catalog.addTaskButton).toBeVisible()
    await expect(catalog.tasksSearch).toBeVisible()
    await expect(catalog.taskFormCard).not.toBeVisible()
    await catalog.addTaskButton.click()
    await expect(catalog.taskFormCard).toBeVisible()
    await expect(catalog.taskCard(mockTask.id)).toBeVisible()

    await shell.adminNav.click()
    await admin.modelsTab.click()
    await expect(admin.modelsPage).toBeVisible()
    await expect(admin.modelCard(mockModel.id)).toBeVisible()
  })
})
