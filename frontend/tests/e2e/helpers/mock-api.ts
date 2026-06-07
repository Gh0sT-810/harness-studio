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
          iterations: [{ id: 'i1', executionId: 'e1', status: 'passed', iterationNumber: 1, timelineArtifactId: 'timeline-1' }],
          counts: { total: 1, pending: 1 },
          report: { status: 'not_configured' },
        },
        'snapshot',
      ),
    })
  })
  const artifacts = [
    {
      id: 'before-1',
      scope: 'iterations/i1',
      artifactType: 'screenshot',
      objectKey: 'iterations/i1/screenshots/before.png',
      sizeBytes: 8,
      contentHash: 'hash-before',
      metadata: { filename: 'before.png', contentType: 'image/png' },
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'after-1',
      scope: 'iterations/i1',
      artifactType: 'screenshot',
      objectKey: 'iterations/i1/screenshots/after.png',
      sizeBytes: 8,
      contentHash: 'hash-after',
      metadata: { filename: 'after.png', contentType: 'image/png' },
      createdAt: '2026-01-01T00:00:01Z',
    },
    {
      id: 'timeline-1',
      scope: 'iterations/i1',
      artifactType: 'timeline',
      objectKey: 'iterations/i1/timeline/action_timeline.json',
      sizeBytes: 120,
      contentHash: 'hash-timeline',
      metadata: { filename: 'action_timeline.json', contentType: 'application/json' },
      createdAt: '2026-01-01T00:00:02Z',
    },
    {
      id: 'log-1',
      scope: 'iterations/i1',
      artifactType: 'log',
      objectKey: 'iterations/i1/logs/execution.log',
      sizeBytes: 12,
      contentHash: 'hash-log',
      metadata: { filename: 'execution.log', contentType: 'text/plain' },
      createdAt: '2026-01-01T00:00:03Z',
    },
  ]
  await page.route('**/api/iterations/i1/files', async (route) => {
    await route.fulfill({ json: artifacts })
  })
  await page.route('**/api/iterations/i1/timeline', async (route) => {
    await route.fulfill({
      json: {
        version: 'v1',
        iterationId: 'i1',
        steps: [
          {
            id: 'step-1',
            index: 1,
            type: 'navigate',
            message: 'Captured browser state',
            url: 'https://example.com',
            title: 'Demo Gym',
            beforeArtifactId: 'before-1',
            afterArtifactId: 'after-1',
          },
        ],
      },
    })
  })
  await page.route('**/api/artifacts/before-1', async (route) => {
    await route.fulfill({ body: Buffer.from('before'), contentType: 'image/png' })
  })
  await page.route('**/api/artifacts/after-1', async (route) => {
    await route.fulfill({ body: Buffer.from('after'), contentType: 'image/png' })
  })
  await page.route('**/api/artifacts/log-1', async (route) => {
    await route.fulfill({ body: 'log captured', contentType: 'text/plain' })
  })
}
