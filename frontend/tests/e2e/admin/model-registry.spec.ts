import { expect, test } from '@playwright/test'

import { mockModel, mockProvider, seedAuthenticatedState } from '../helpers/mock-api'

test.describe('Admin Model Registry', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await page.route('**/api/me', async (route) => {
      await route.fulfill({ json: { success: true, message: 'current user', statusCode: 200, data: { id: 'admin-1', email: 'admin@example.com', displayName: 'Admin', role: 'admin' } } })
    })
  })

  test('creates provider and model, tests config, and sets default', async ({ page }) => {
    let providers = [mockProvider]
    let models = [mockModel]

    await page.route('**/api/model-providers', async (route) => {
      if (route.request().method() === 'POST') {
        providers = [{ ...mockProvider, id: 'provider-2', key: 'openai', displayName: 'OpenAI', name: 'OpenAI', adapterKey: 'openai_responses_computer', enabled: true }]
        await route.fulfill({ json: { success: true, message: 'created', statusCode: 201, data: providers[0] } })
        return
      }
      await route.fulfill({ json: { success: true, message: 'providers', statusCode: 200, data: providers } })
    })
    await page.route('**/api/model-providers/provider-2/test', async (route) => {
      await route.fulfill({ json: { success: true, message: 'tested', statusCode: 200, data: { status: 'ok', message: 'provider config valid' } } })
    })
    await page.route('**/api/models', async (route) => {
      if (route.request().method() === 'POST') {
        models = [{ ...mockModel, id: 'model-2', providerId: 'provider-2', displayName: 'GPT 4.1', modelName: 'gpt-4.1', isDefault: false, enabled: true }]
        await route.fulfill({ json: { success: true, message: 'created', statusCode: 201, data: models[0] } })
        return
      }
      await route.fulfill({ json: { success: true, message: 'models', statusCode: 200, data: models } })
    })
    await page.route('**/api/models/model-2/default', async (route) => {
      models = models.map((model) => ({ ...model, isDefault: model.id === 'model-2' }))
      await route.fulfill({ json: { success: true, message: 'default', statusCode: 200, data: models[0] } })
    })
    await page.route('**/api/models/model-2/test', async (route) => {
      await route.fulfill({ json: { success: true, message: 'tested', statusCode: 200, data: { status: 'ok', message: 'model config valid' } } })
    })

    await page.goto('/admin?tab=models')
    await page.locator('[data-id="provider-key-input"]').fill('openai')
    await page.locator('[data-id="provider-name-input"]').fill('OpenAI')
    await page.locator('[data-id="provider-adapter-input"]').fill('openai_responses_computer')
    await page.locator('[data-id="provider-submit"]').click()
    await expect(page.locator('[data-id="provider-card-provider-2"]')).toBeVisible()
    await page.locator('[data-id="provider-test-provider-2"]').click()
    await expect(page.getByText('provider config valid')).toBeVisible()

    await page.locator('[data-id="model-provider-input"]').selectOption('provider-2')
    await page.locator('[data-id="model-name-input"]').fill('gpt-4.1')
    await page.locator('[data-id="model-display-input"]').fill('GPT 4.1')
    await page.locator('[data-id="model-submit"]').click()
    await expect(page.locator('[data-id="model-card-model-2"]')).toBeVisible()
    await page.locator('[data-id="model-default-action-model-2"]').click()
    await expect(page.locator('[data-id="model-default-model-2"]')).toBeVisible()
    await page.locator('[data-id="model-test-model-2"]').click()
    await expect(page.getByText('model config valid')).toBeVisible()
  })
})
