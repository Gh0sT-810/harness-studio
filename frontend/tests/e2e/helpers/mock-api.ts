import { Page } from '@playwright/test'

import { mockBatch, mockDomain, mockGym, mockModel, mockProvider, mockTask, seededAdmin } from '../fixtures/test-data'

export { mockBatch, mockDomain, mockGym, mockModel, mockProvider, mockTask, seededAdmin }

function envelope<T>(data: T, message = 'ok') {
  return {
    success: true,
    message,
    statusCode: 200,
    data,
  }
}

export async function seedAuthenticatedState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'test-token')
    localStorage.setItem('theme', 'light')
  })
}

export async function mockPhase2Api(page: Page) {
  await page.route('**/api/me', async (route) => {
    await route.fulfill({ json: envelope(seededAdmin, 'current user') })
  })
  await page.route('**/api/gyms', async (route) => {
    await route.fulfill({ json: envelope([mockGym], 'gyms') })
  })
  await page.route('**/api/tasks', async (route) => {
    await route.fulfill({ json: envelope([mockTask], 'tasks') })
  })
  await page.route('**/api/models', async (route) => {
    await route.fulfill({ json: envelope([mockModel], 'models') })
  })
  await page.route('**/api/model-providers', async (route) => {
    await route.fulfill({ json: envelope([mockProvider], 'providers') })
  })
  await page.route('**/api/batches', async (route) => {
    await route.fulfill({ json: envelope([mockBatch], 'batches') })
  })
  await page.route('**/api/users', async (route) => {
    await route.fulfill({ json: envelope([seededAdmin], 'users') })
  })
  await page.route('**/api/domains', async (route) => {
    await route.fulfill({ json: envelope([mockDomain], 'domains') })
  })
  await page.route('**/api/batches/b1/snapshot', async (route) => {
    await route.fulfill({
      json: envelope(
        {
          batch: mockBatch,
          executions: [{ id: 'e1', status: 'pending', snapshotPrompt: mockTask.prompt }],
          iterations: [{ id: 'i1', executionId: 'e1', status: 'pending', iterationNumber: 1 }],
          counts: { total: 1, pending: 1 },
        },
        'snapshot',
      ),
    })
  })
}
