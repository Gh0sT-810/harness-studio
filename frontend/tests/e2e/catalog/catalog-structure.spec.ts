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
    await expect(catalog.gymsHeaderSection).toContainText('Gyms')
    await expect(catalog.gymsActionsSection).toHaveClass(/harness-actions-section/)
    await expect(catalog.gymsActionsLabel).toHaveText('Actions:')
    await expect(catalog.addGymButton).toBeVisible()
    await expect(catalog.gymFormCard).not.toBeVisible()
    await catalog.addGymButton.click()
    await expect(catalog.gymFormCard).toBeVisible()
    await expect(catalog.gymCard(mockGym.id)).toBeVisible()

    await catalog.gymTasksLink(mockGym.id).click()
    await expect(catalog.tasksPage).toBeVisible()
    await expect(catalog.tasksHeaderSection).toContainText(`${mockGym.name} Tasks`)
    await expect(catalog.tasksActionsSection).toHaveClass(/harness-actions-section/)
    await expect(catalog.tasksActionsLabel).toHaveText('Actions:')
    await expect(catalog.tasksBackToGyms).toBeVisible()
    await expect(catalog.addTaskButton).toBeVisible()
    await expect(catalog.tasksSearch).toBeVisible()
    await expect(catalog.taskFormCard).not.toBeVisible()
    await catalog.addTaskButton.click()
    await expect(catalog.taskFormCard).toBeVisible()
    await expect(catalog.taskCard(mockTask.id)).toBeVisible()
    await catalog.taskEditButton(mockTask.id).click()
    await expect(page).toHaveURL(`/gyms/${mockGym.id}/tasks/${mockTask.id}/edit`)
    await expect(catalog.taskEditPage).toBeVisible()
    await expect(catalog.taskIdInput()).toHaveValue(mockTask.taskId)
    await catalog.taskEditBackToTasks.click()
    await expect(catalog.tasksPage).toBeVisible()
    await catalog.tasksBackToGyms.click()
    await expect(catalog.gymsPage).toBeVisible()

    await shell.adminNav.click()
    await admin.modelsTab.click()
    await expect(admin.modelsPage).toBeVisible()
    await expect(admin.modelCard(mockModel.id)).toBeVisible()
    await expect(admin.modelDefaultBadge(mockModel.id)).toBeVisible()
    await expect(admin.modelDefaultBadge(mockModel.id)).toHaveClass(/harness-badge-tag/)
  })
})
