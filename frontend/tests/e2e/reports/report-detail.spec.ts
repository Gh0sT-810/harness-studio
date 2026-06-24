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

  test('downloads the JSON artifact via an authenticated request and uses the server filename', async ({ page }) => {
    let authHeader: string | undefined
    await page.route('**/api/artifacts/artifact-report-1', async (route) => {
      authHeader = route.request().headers()['authorization']
      await route.fulfill({
        contentType: 'application/json',
        headers: { 'Content-Disposition': 'attachment; filename="batch_report.json"' },
        body: JSON.stringify({ batchId: 'b1', passRate: 1 }),
      })
    })

    await page.goto('/reports/b1')
    const downloadButton = page.locator('[data-id="download-report-artifact-button"]')
    await expect(downloadButton).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await downloadButton.click()
    const download = await downloadPromise

    expect(authHeader).toBe('Bearer test-token')
    expect(download.suggestedFilename()).toBe('batch_report.json')
    await expect(page.locator('[data-id="download-report-artifact-error"]')).toHaveCount(0)
  })

  test('surfaces an error when the artifact download fails', async ({ page }) => {
    await page.route('**/api/artifacts/artifact-report-1', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'boom', statusCode: 500 }) })
    })

    await page.goto('/reports/b1')
    await page.locator('[data-id="download-report-artifact-button"]').click()
    await expect(page.locator('[data-id="download-report-artifact-error"]')).toBeVisible()
  })
})
