import { expect, test } from '@playwright/test'

import { mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'

test.describe('Token Usage', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('renders range control, daily-tokens chart, and vs-prev deltas', async ({ page }) => {
    await page.goto('/usage')
    await expect(page.locator('[data-id="token-usage-page"]')).toBeVisible()
    await expect(page.locator('[data-id="token-usage-range"]')).toBeVisible()
    await expect(page.locator('[data-id="token-usage-range-7d"]')).toBeVisible()
    await expect(page.locator('[data-id="token-usage-range-30d"]')).toHaveClass(/active/)
    await expect(page.locator('[data-id="token-usage-range-90d"]')).toBeVisible()
    await expect(page.locator('[data-id="token-usage-trend"]')).toBeVisible()
    await expect(page.locator('[data-id="token-usage-daily-tokens"]')).toBeVisible()
    await page.locator('[data-id="token-usage-range-7d"]').click()
    await expect(page.locator('[data-id="token-usage-range-7d"]')).toHaveClass(/active/)
  })
})
