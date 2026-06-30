import { Page } from '@playwright/test'

import { mockBatch, mockBatchAnalytics, mockDomain, mockGym, mockLeaderboardRow, mockModel, mockProvider, mockReportJob, mockTask, mockUsageSummary, seededAdmin } from '../fixtures/test-data'

export { mockBatch, mockBatchAnalytics, mockDomain, mockGym, mockLeaderboardRow, mockModel, mockProvider, mockReportJob, mockTask, mockUsageSummary, seededAdmin }

function envelope<T>(data: T, message = 'ok') {
  return {
    success: true,
    message,
    statusCode: 200,
    data,
  }
}

// Viewport-exact ("ditto") frame: 1280x800, like the new capture pipeline produces.
const viewportScreenshot = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><rect width="1280" height="800" fill="#ffffff"/><rect x="0" y="0" width="1280" height="120" fill="#e5e7eb"/><text x="64" y="92" font-family="Arial" font-size="48" fill="#111827">Viewport screenshot fixture</text><circle cx="640" cy="360" r="48" fill="#ef4444"/></svg>',
)

// Legacy full-page frame recorded before viewport capture existed (regression fixture).
const tallScreenshot = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="2400" viewBox="0 0 1280 2400"><rect width="1280" height="2400" fill="#ffffff"/><rect x="0" y="0" width="1280" height="120" fill="#e5e7eb"/><text x="64" y="92" font-family="Arial" font-size="48" fill="#111827">Tall browser screenshot fixture</text><circle cx="640" cy="360" r="48" fill="#ef4444"/></svg>',
)

type CursorFixture = { x: number; y: number } | null

function viewportCapture(cursor: CursorFixture) {
  return {
    viewport: { width: 1280, height: 800 },
    screenshot: { fullPage: false, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
    cursor: cursor
      ? { coordinateBasis: 'viewport', x: cursor.x, y: cursor.y, visible: true }
      : { coordinateBasis: 'viewport', visible: false },
  }
}

const fullPageCapture = {
  viewport: { width: 1280, height: 800 },
  screenshot: { fullPage: true, scrollX: 0, scrollY: 0, deviceScaleFactor: 1 },
  cursor: { coordinateBasis: 'viewport' },
}

/**
 * Replaces window.EventSource with a controllable mock and exposes
 * window.__emitBatchEvent(type, data, lastEventId) so tests can push batch SSE
 * events (the same channel the app uses for live updates). Must run before the
 * page navigates.
 */
export async function installMockEventSource(page: Page) {
  await page.addInitScript(() => {
    type EventListenerMap = Record<string, Array<(event: MessageEvent<string>) => void>>

    class MockEventSource {
      static instances: MockEventSource[] = []
      readonly url: string
      onopen: ((event: Event) => void) | null = null
      onerror: ((event: Event) => void) | null = null
      onmessage: ((event: MessageEvent<string>) => void) | null = null
      private readonly listeners: EventListenerMap = {}

      constructor(url: string) {
        this.url = url
        MockEventSource.instances.push(this)
        queueMicrotask(() => this.onopen?.(new Event('open')))
      }

      addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        this.listeners[type] = [...(this.listeners[type] ?? []), listener]
      }

      removeEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
        this.listeners[type] = (this.listeners[type] ?? []).filter((item) => item !== listener)
      }

      close() {}

      emit(type: string, data: unknown, lastEventId: string) {
        const message = new MessageEvent(type, { data: JSON.stringify(data), lastEventId })
        for (const listener of this.listeners[type] ?? []) {
          listener(message)
        }
        if (type === 'message') {
          this.onmessage?.(message)
        }
      }
    }

    window.EventSource = MockEventSource as unknown as typeof EventSource
    ;(window as unknown as { __emitBatchEvent: (type: string, data: unknown, lastEventId: string) => void }).__emitBatchEvent = (
      type,
      data,
      lastEventId,
    ) => {
      const source = MockEventSource.instances[MockEventSource.instances.length - 1]
      source?.emit(type, data, lastEventId)
    }
  })
}

export async function seedAuthenticatedState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'test-token')
    localStorage.setItem('theme', 'light')
  })
}

export type MockPhase2Options = {
  /** Artificial latency for screenshot artifact responses (transition tests). */
  artifactDelayMs?: number
  /** Iteration status in the snapshot; 'passed' simulates a completed run. */
  iterationStatus?: 'executing' | 'passed'
}

export async function mockPhase2Api(page: Page, options: MockPhase2Options = {}) {
  const artifactDelayMs = options.artifactDelayMs ?? 0
  const iterationStatus = options.iterationStatus ?? 'executing'
  const artifactDelay = () => (artifactDelayMs > 0 ? new Promise((resolve) => setTimeout(resolve, artifactDelayMs)) : Promise.resolve())
  let batchCancelled = false

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
  await page.route('**/api/usage/summary**', async (route) => {
    await route.fulfill({ json: envelope(mockUsageSummary, 'usage summary') })
  })
  await page.route('**/api/leaderboard', async (route) => {
    await route.fulfill({ json: envelope([mockLeaderboardRow], 'leaderboard') })
  })
  await page.route('**/api/batches/b1/analytics', async (route) => {
    await route.fulfill({ json: envelope(mockBatchAnalytics, 'batch analytics') })
  })
  await page.route('**/api/batches/b1/report', async (route) => {
    await route.fulfill({ json: envelope(mockReportJob, 'report') })
  })
  await page.route('**/api/model-providers/p1/test', async (route) => {
    await route.fulfill({ json: envelope({ status: 'ok', message: 'provider config valid' }, 'tested') })
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
          batch: { ...mockBatch, status: batchCancelled ? 'cancelled' : mockBatch.status },
          executions: [{ id: 'e1', status: batchCancelled ? 'cancelled' : 'pending', taskId: mockTask.id, modelId: mockModel.id, snapshotTaskId: mockTask.taskId, snapshotPrompt: mockTask.prompt }],
          iterations: [{ id: 'i1', executionId: 'e1', status: batchCancelled ? 'cancelled' : iterationStatus, iterationNumber: 1, timelineArtifactId: 'timeline-1', totalSteps: 14, cost: 0.03 }],
          counts: batchCancelled ? { total: 1, cancelled: 1 } : { total: 1, [iterationStatus]: 1 },
          report: { status: 'not_configured' },
          catalog: {
            gyms: { [mockGym.id]: mockGym },
            tasks: { [mockTask.id]: mockTask },
            models: { [mockModel.id]: mockModel },
          },
        },
        'snapshot',
      ),
    })
  })
  await page.route('**/api/batches/b1/cancel', async (route) => {
    batchCancelled = true
    await route.fulfill({ status: 202, json: envelope({ id: mockBatch.id }, 'batch cancellation requested') })
  })
  const screenshotArtifact = (id: string, filename: string, extra: Record<string, unknown> = {}) => ({
    id,
    scope: 'iterations/i1',
    artifactType: 'screenshot',
    objectKey: `iterations/i1/screenshots/${filename}`,
    sizeBytes: viewportScreenshot.byteLength,
    contentHash: `hash-${id}`,
    metadata: { filename, contentType: 'image/png', ...extra },
    createdAt: '2026-01-01T00:00:01Z',
  })
  const artifacts = [
    screenshotArtifact('before-1', 'before.png', { timelineKind: 'before', capture: viewportCapture(null) }),
    screenshotArtifact('after-1', 'after.png', { timelineKind: 'after', capture: viewportCapture(null) }),
    screenshotArtifact('before-2', 'step-2-before.png', { timelineKind: 'before', timelineStepIndex: 2, action: 'click', capture: viewportCapture(null) }),
    screenshotArtifact('after-2', 'step-2-after.png', { timelineKind: 'after', timelineStepIndex: 2, action: 'click', capture: viewportCapture({ x: 640, y: 360 }) }),
    screenshotArtifact('before-3', 'step-3-before.png', { timelineKind: 'before', timelineStepIndex: 3, action: 'keypress', capture: viewportCapture({ x: 640, y: 360 }) }),
    screenshotArtifact('after-3', 'step-3-after.png', { timelineKind: 'after', timelineStepIndex: 3, action: 'keypress', capture: viewportCapture({ x: 640, y: 360 }) }),
    {
      id: 'before-4',
      scope: 'iterations/i1',
      artifactType: 'screenshot',
      objectKey: 'iterations/i1/screenshots/step-4-before.png',
      sizeBytes: tallScreenshot.byteLength,
      contentHash: 'hash-before-4',
      metadata: { filename: 'step-4-before.png', contentType: 'image/png', timelineKind: 'before', timelineStepIndex: 4, action: 'click', capture: fullPageCapture },
      createdAt: '2026-01-01T00:00:01Z',
    },
    {
      id: 'after-4',
      scope: 'iterations/i1',
      artifactType: 'screenshot',
      objectKey: 'iterations/i1/screenshots/step-4-after.png',
      sizeBytes: tallScreenshot.byteLength,
      contentHash: 'hash-after-4',
      metadata: { filename: 'step-4-after.png', contentType: 'image/png', timelineKind: 'after', timelineStepIndex: 4, action: 'click', capture: fullPageCapture },
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
    {
      id: 'conversation-1',
      scope: 'iterations/i1',
      artifactType: 'conversation',
      objectKey: 'iterations/i1/conversation/conversation.json',
      sizeBytes: 16,
      contentHash: 'hash-conversation',
      metadata: { filename: 'conversation.json', contentType: 'application/json' },
      createdAt: '2026-01-01T00:00:04Z',
    },
    {
      id: 'response-1',
      scope: 'iterations/i1',
      artifactType: 'task_response',
      objectKey: 'iterations/i1/task_response/response.json',
      sizeBytes: 16,
      contentHash: 'hash-response',
      metadata: { filename: 'response.json', contentType: 'application/json' },
      createdAt: '2026-01-01T00:00:05Z',
    },
    {
      id: 'verification-1',
      scope: 'iterations/i1',
      artifactType: 'verification',
      objectKey: 'iterations/i1/verification/verification.json',
      sizeBytes: 16,
      contentHash: 'hash-verification',
      metadata: { filename: 'verification.json', contentType: 'application/json' },
      createdAt: '2026-01-01T00:00:06Z',
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
            afterArtifactId: 'before-1',
            capture: viewportCapture(null),
            captureAfter: viewportCapture(null),
          },
          {
            id: 'step-2',
            index: 2,
            type: 'model_action',
            provider: 'openai',
            action: 'click',
            args: { x: 640, y: 360 },
            message: 'openai click',
            reasoning: 'I will click the Add to cart button to start checkout.',
            url: 'https://example.com/done',
            title: 'Demo Gym Done',
            beforeArtifactId: 'before-2',
            afterArtifactId: 'after-2',
            capture: viewportCapture(null),
            captureAfter: viewportCapture({ x: 640, y: 360 }),
          },
          {
            id: 'step-3',
            index: 3,
            type: 'model_action',
            provider: 'openai',
            action: 'keypress',
            args: { keys: ['ctrl', 'a'] },
            message: 'openai keypress',
            reasoning: 'Selecting all text in the promo field before typing.',
            url: 'https://example.com/done',
            title: 'Demo Gym Done',
            beforeArtifactId: 'before-3',
            afterArtifactId: 'after-3',
            capture: viewportCapture({ x: 640, y: 360 }),
            captureAfter: viewportCapture({ x: 640, y: 360 }),
          },
          {
            id: 'step-4',
            index: 4,
            type: 'model_action',
            provider: 'openai',
            action: 'click',
            args: { x: 640, y: 360 },
            message: 'openai click on legacy full-page frame',
            url: 'https://example.com/legacy',
            title: 'Legacy Frame',
            beforeArtifactId: 'before-4',
            afterArtifactId: 'after-4',
            capture: fullPageCapture,
          },
          {
            id: 'step-final',
            index: 5,
            type: 'final',
            message: 'Final state',
            url: 'https://example.com/legacy',
            title: 'Legacy Frame',
            afterArtifactId: 'after-1',
            capture: viewportCapture({ x: 640, y: 360 }),
            captureAfter: viewportCapture({ x: 640, y: 360 }),
          },
        ],
      },
    })
  })
  for (const id of ['before-1', 'after-1', 'before-2', 'after-2', 'before-3', 'after-3']) {
    await page.route(`**/api/artifacts/${id}`, async (route) => {
      await artifactDelay()
      await route.fulfill({ body: viewportScreenshot, contentType: 'image/svg+xml' })
    })
  }
  for (const id of ['before-4', 'after-4']) {
    await page.route(`**/api/artifacts/${id}`, async (route) => {
      await artifactDelay()
      await route.fulfill({ body: tallScreenshot, contentType: 'image/svg+xml' })
    })
  }
  await page.route('**/api/artifacts/timeline-1', async (route) => {
    await route.fulfill({ body: JSON.stringify({ version: 'v1', iterationId: 'i1', steps: [] }), contentType: 'application/json' })
  })
  await page.route('**/api/artifacts/log-1', async (route) => {
    await route.fulfill({
      body: [
        '2026-01-01T00:00:00Z INFO starting iteration i1',
        '2026-01-01T00:00:01Z DEBUG navigating to https://example.com',
        '2026-01-01T00:00:02Z WARN element settle took 240ms',
        '2026-01-01T00:00:03Z ERROR verification failed: missing Order #',
        'plain trailing line without a level',
      ].join('\n'),
      contentType: 'text/plain',
    })
  })
}
