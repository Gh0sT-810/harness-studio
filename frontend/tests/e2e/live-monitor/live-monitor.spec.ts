import { expect, test } from '@playwright/test'

import { mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'
import { BatchPage } from '../pages/BatchPage'

test.describe('Live Monitor', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('opens playback with timeline, browser replay, controls, and files', async ({ page }) => {
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await expect(batchPage.snapshotPage).toBeVisible()
    await batchPage.openLiveMonitor('i1').click()

    await expect(batchPage.liveMonitor).toBeVisible()
    await expect(batchPage.liveMonitorTimeline).toBeVisible()
    await expect(batchPage.liveMonitorBrowser).toBeVisible()
    await expect(batchPage.liveMonitorFiles).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-step-0"]')).toContainText('Captured browser state')
    await expect(page.locator('[data-id="live-monitor-url"]')).toContainText('https://example.com')
    await expect(page.locator('[data-id="live-monitor-play"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-speed-1"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-file-timeline-1"]')).toContainText('action_timeline.json')
    await expect(page.locator('[data-id="live-monitor-screenshot"]')).toBeVisible()
  })
})
