import { expect, test } from '@playwright/test'

import { seedAuthenticatedState } from '../helpers/mock-api'

function workersData(overrides: Record<string, unknown> = {}) {
  return {
    desired: 6,
    actual: 2,
    total: 2,
    flowerAvailable: true,
    workers: [
      { id: 'w1', name: 'harness-worker-1', state: 'running', activity: 'idle' },
      { id: 'w2', name: 'harness-worker-2', state: 'running', activity: 'busy' },
    ],
    ...overrides,
  }
}

function envelope(data: unknown, statusCode = 200, success = true) {
  return { success, message: 'workers', statusCode, data }
}

test.describe('Admin Workers', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await page.route('**/api/me', async (route) => {
      await route.fulfill({
        json: { success: true, message: 'me', statusCode: 200, data: { id: 'admin-1', email: 'admin@example.com', displayName: 'Admin', role: 'admin' } },
      })
    })
  })

  test('renders the workers tab and live status table', async ({ page }) => {
    await page.route('**/api/admin/workers', async (route) => route.fulfill({ json: envelope(workersData()) }))

    await page.goto('/admin?tab=workers')

    await expect(page.locator('[data-id="admin-tab-workers"]')).toBeVisible()
    await expect(page.locator('[data-id="admin-workers-panel"]')).toBeVisible()
    await expect(page.locator('[data-id="worker-row-w1"]')).toBeVisible()
    await expect(page.locator('[data-id="worker-activity-w1"]')).toContainText('idle')
    await expect(page.locator('[data-id="worker-activity-w2"]')).toContainText('busy')
    await expect(page.locator('[data-id="workers-actual"]')).toContainText('2')
    await expect(page.locator('[data-id="workers-desired"]')).toContainText('6')
  })

  test('scales workers with the entered count', async ({ page }) => {
    let scaleBody: Record<string, unknown> | null = null
    await page.route('**/api/admin/workers', async (route) => route.fulfill({ json: envelope(workersData()) }))
    await page.route('**/api/admin/workers/scale', async (route) => {
      scaleBody = route.request().postDataJSON()
      await route.fulfill({ json: envelope({ desired: 8, actual: 8 }) })
    })

    await page.goto('/admin?tab=workers')
    await page.locator('[data-id="workers-scale-input"]').fill('8')
    await page.locator('[data-id="workers-scale-save"]').click()

    await expect(page.locator('[data-id="workers-scale-message"]')).toBeVisible()
    expect(scaleBody).toEqual({ replicas: 8 })
  })

  test('rejects an out-of-range count without calling the API', async ({ page }) => {
    let scaleCalled = false
    await page.route('**/api/admin/workers', async (route) => route.fulfill({ json: envelope(workersData()) }))
    await page.route('**/api/admin/workers/scale', async (route) => {
      scaleCalled = true
      await route.fulfill({ json: envelope({}) })
    })

    await page.goto('/admin?tab=workers')
    await page.locator('[data-id="workers-scale-input"]').fill('999')
    await page.locator('[data-id="workers-scale-save"]').click()

    await expect(page.locator('[data-id="workers-scale-error"]')).toBeVisible()
    expect(scaleCalled).toBe(false)
  })

  test('stop-idle and per-row restart call their endpoints', async ({ page }) => {
    let stopIdleCalled = false
    let restartId = ''
    await page.route('**/api/admin/workers', async (route) => route.fulfill({ json: envelope(workersData()) }))
    await page.route('**/api/admin/workers/stop-idle', async (route) => {
      stopIdleCalled = true
      await route.fulfill({ json: envelope({ stopped: [] }) })
    })
    await page.route('**/api/admin/workers/*/restart', async (route) => {
      restartId = route.request().url().split('/workers/')[1].split('/restart')[0]
      await route.fulfill({ json: envelope({ action: 'restart' }) })
    })

    await page.goto('/admin?tab=workers')
    await page.locator('[data-id="workers-stop-idle"]').click()
    await expect.poll(() => stopIdleCalled).toBe(true)
    await page.locator('[data-id="worker-restart-w1"]').click()
    await expect.poll(() => restartId).toBe('w1')
  })

  test('shows an error state (shell intact) when the worker service is unavailable', async ({ page }) => {
    await page.route('**/api/admin/workers', async (route) =>
      route.fulfill({ status: 502, json: envelope(null, 502, false) }),
    )

    await page.goto('/admin?tab=workers')

    await expect(page.locator('[data-id="workers-error"]')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-id="admin-tabs"]')).toBeVisible()
  })

  test('shows an empty state when no workers are running', async ({ page }) => {
    await page.route('**/api/admin/workers', async (route) =>
      route.fulfill({ json: envelope(workersData({ actual: 0, total: 0, workers: [] })) }),
    )

    await page.goto('/admin?tab=workers')

    await expect(page.locator('[data-id="workers-empty"]')).toBeVisible()
  })
})
