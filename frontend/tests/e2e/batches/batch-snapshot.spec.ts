import { expect, test } from '@playwright/test'

import { mockBatch, mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'
import { BatchPage } from '../pages/BatchPage'

test.describe('Batch Snapshot', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('renders consolidated snapshot data without polling-specific UI', async ({ page }) => {
    const batchPage = new BatchPage(page)

    await page.goto('/batches')
    await expect(batchPage.batchesPage).toBeVisible()
    await expect(batchPage.batchesHeaderSection).toContainText('Batches')
    await expect(batchPage.batchesActionsSection).toHaveClass(/harness-actions-section/)
    await expect(batchPage.batchesActionsLabel).toHaveText('Actions:')
    await expect(batchPage.addBatchButton).toBeVisible()
    await expect(batchPage.batchesSearch).toBeVisible()
    await expect(batchPage.batchFormCard).not.toBeVisible()
    await batchPage.addBatchButton.click()
    await expect(batchPage.batchFormCard).toBeVisible()
    await expect(batchPage.batchCard(mockBatch.id)).toBeVisible()

    await page.goto('/batches/b1/runs')
    await expect(batchPage.snapshotPage).toBeVisible()
    await expect(batchPage.snapshotBackToBatches).toBeVisible()
    await expect(page.locator('[data-id="event-connection-state"]')).toBeVisible()
    await expect(page.locator('[data-id="snapshot-reload-button"]')).toBeVisible()
    await expect(page.locator('[data-id="snapshot-count-total"]')).toBeVisible()
    await expect(page.locator('[data-id="failure-diagnostics-panel"]')).toBeVisible()
    await expect(page.locator('[data-id="batch-insights-tabs"]')).toBeVisible()
    await expect(page.locator('[data-id="event-stream-panel"]')).toBeVisible()
    await expect(page.locator('.harness-code-block-header')).toBeVisible()
    await expect(batchPage.snapshotExecution('e1')).toBeVisible()
    await expect(batchPage.snapshotIteration('i1')).toBeVisible()
    await batchPage.snapshotBackToBatches.click()
    await expect(page).toHaveURL('/batches')
    await expect(batchPage.batchesPage).toBeVisible()
  })
})
