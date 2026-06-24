import { expect, test } from '@playwright/test'

import { mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'

test.describe('Leaderboard', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('renders ranked rows with a trend sparkline', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('[data-id="leaderboard-page"]')).toBeVisible()
    await expect(page.locator('[data-id="leaderboard-table"]')).toBeVisible()
    await expect(page.locator('[data-id="leaderboard-row-m1-g1"]')).toBeVisible()
    await expect(page.locator('[data-id="leaderboard-trend-m1-g1"]')).toBeVisible()
  })
})
