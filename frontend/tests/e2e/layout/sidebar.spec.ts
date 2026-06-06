import { expect, test } from '@playwright/test'

import { mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'
import { AppShellPage } from '../pages/AppShellPage'

test.describe('Sidebar Layout', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
    await page.goto('/gyms')
  })

  test('collapses and expands like the reference app sidebar', async ({ page }) => {
    const shell = new AppShellPage(page)

    await expect(shell.sidebar).toBeVisible()
    await shell.expectSidebarCollapsed()

    await shell.expandSidebar()
    await shell.expectSidebarExpanded()

    await shell.collapseSidebar()
    await shell.expectSidebarCollapsed()
  })
})
