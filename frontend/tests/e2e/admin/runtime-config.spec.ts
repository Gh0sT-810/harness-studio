import { expect, test } from '@playwright/test'

import { seedAuthenticatedState } from '../helpers/mock-api'

test.describe('Admin Runtime Config', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await page.route('**/api/me', async (route) => {
      await route.fulfill({ json: { success: true, message: 'current user', statusCode: 200, data: { id: 'admin-1', email: 'admin@example.com', displayName: 'Admin', role: 'admin' } } })
    })
  })

  test('saves runtime and embedding configuration', async ({ page }) => {
    let runtimeValue = { defaultModelId: 'model-1', modelCallTimeoutSeconds: 30 }
    let embeddingValue = { providerKey: 'text', modelId: 'embedding-1' }

    await page.route('**/api/admin/runtime-config', async (route) => {
      if (route.request().method() === 'PUT') {
        runtimeValue = await route.request().postDataJSON()
      }
      await route.fulfill({ json: { success: true, message: 'runtime', statusCode: 200, data: { key: 'runtime', value: runtimeValue } } })
    })
    await page.route('**/api/admin/embedding-config', async (route) => {
      if (route.request().method() === 'PUT') {
        embeddingValue = await route.request().postDataJSON()
      }
      await route.fulfill({ json: { success: true, message: 'embedding', statusCode: 200, data: { key: 'embedding', value: embeddingValue } } })
    })

    await page.goto('/admin?tab=runtime')
    await page.locator('[data-id="runtime-config-input"]').fill('{"defaultModelId":"model-2","modelCallTimeoutSeconds":45}')
    await page.locator('[data-id="runtime-config-save"]').click()
    await expect(page.getByText('Runtime config saved')).toBeVisible()

    await page.locator('[data-id="embedding-config-input"]').fill('{"providerKey":"openai","modelId":"text-embedding-3-small"}')
    await page.locator('[data-id="embedding-config-save"]').click()
    await expect(page.getByText('Embedding config saved')).toBeVisible()
  })
})
