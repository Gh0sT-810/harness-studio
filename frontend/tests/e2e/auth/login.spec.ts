import { expect, test } from '@playwright/test'

import { seededAdmin } from '../fixtures/test-data'
import { AuthPage } from '../pages/AuthPage'

test.describe('Login Flow', () => {
  test('protected routes redirect to login', async ({ page }) => {
    const authPage = new AuthPage(page)

    await page.goto('/gyms')

    await expect(authPage.loginPage).toBeVisible()
    await expect(authPage.loginPage).toHaveClass(/harness-hero-band-sky/)
    await expect(authPage.loginCard).toHaveClass(/harness-card-padding/)
    await expect(authPage.loginForm).toBeVisible()
  })

  test('login page exposes seeded admin form', async ({ page }) => {
    const authPage = new AuthPage(page)

    await authPage.gotoLogin()

    await expect(authPage.loginCard).toBeVisible()
    await expect(authPage.emailInput).toHaveValue(seededAdmin.email)
    await expect(authPage.passwordInput).toHaveValue(seededAdmin.password)
    await expect(authPage.submitButton).toBeVisible()
  })
})
