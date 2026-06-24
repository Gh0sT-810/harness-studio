import { expect, test } from '@playwright/test'

import { mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'

test.describe('Report Detail', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('renders batch analytics: metrics, pass-rate-by-task, and per-iteration rows', async ({ page }) => {
    await page.goto('/reports/b1')
    await expect(page.locator('[data-id="report-detail-page"]')).toBeVisible()
    await expect(page.locator('[data-id="report-analytics-metrics"]')).toBeVisible()
    await expect(page.locator('[data-id="report-analytics-bytask"]')).toBeVisible()
    await expect(page.locator('[data-id="report-task-TASK-1"]')).toBeVisible()
    await expect(page.locator('[data-id="report-analytics-iterations"]')).toBeVisible()
    await expect(page.locator('[data-id="report-iteration-i1"]')).toBeVisible()
    await expect(page.locator('[data-id="report-iteration-status-i1"]')).toContainText('passed')
  })
})
