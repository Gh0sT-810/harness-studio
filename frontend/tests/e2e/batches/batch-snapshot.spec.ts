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
    await expect(batchPage.batchCard(mockBatch.id)).toBeVisible()

    await page.goto('/batches/b1/runs')
    await expect(batchPage.snapshotPage).toBeVisible()
    await expect(page.locator('[data-id="snapshot-count-total"]')).toBeVisible()
    await expect(batchPage.snapshotExecution('e1')).toBeVisible()
    await expect(batchPage.snapshotIteration('i1')).toBeVisible()
  })
})
