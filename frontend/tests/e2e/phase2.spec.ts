import { expect, test } from '@playwright/test'

test('phase 2 shell exposes data-id backed auth, catalog, and snapshot controls', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('[data-id="phase2-app"]')).toBeVisible()
  await expect(page.locator('[data-id="api-health-card"]')).toBeVisible()
  await expect(page.locator('[data-id="login-form"]')).toBeVisible()
  await expect(page.locator('[data-id="login-email"]')).toHaveValue('test@example.com')
  await expect(page.locator('[data-id="login-password"]')).toHaveValue('Test@$1234')
  await expect(page.locator('[data-id="seed-catalog-button"]')).toBeDisabled()
  await expect(page.locator('[data-id="create-batch-button"]')).toBeDisabled()
})

test('phase 2 shell surfaces API health state', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('[data-id="api-health-status"]')).toBeVisible()
  await expect(page.locator('[data-id="health-check-readiness"]')).toBeVisible()
})
