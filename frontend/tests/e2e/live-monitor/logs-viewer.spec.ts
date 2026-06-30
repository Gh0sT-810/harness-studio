import { expect, test } from '@playwright/test'

import { installMockEventSource, mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'
import { BatchPage } from '../pages/BatchPage'

test.describe('Logs viewer', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('opens from the iterations table and supports search + level filtering', async ({ page }) => {
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await expect(batchPage.snapshotPage).toBeVisible()

    await batchPage.openLogs('i1').click()
    await expect(batchPage.logsViewer).toBeVisible()

    // All parsed lines render, including the one without an explicit level.
    await expect(page.locator('[data-id="logs-line-1"]')).toContainText('starting iteration')
    await expect(page.locator('[data-id="logs-line-4"]')).toContainText('verification failed')
    await expect(page.locator('[data-id="logs-line-5"]')).toContainText('plain trailing line')

    // Free-text search narrows to matching lines.
    await page.locator('[data-id="logs-search"]').fill('verification')
    await expect(page.locator('[data-id="logs-line-4"]')).toBeVisible()
    await expect(page.locator('[data-id="logs-line-1"]')).toHaveCount(0)
    await page.locator('[data-id="logs-search"]').fill('')
    await expect(page.locator('[data-id="logs-line-1"]')).toBeVisible()

    // Minimum-level filter keeps only error lines.
    await page.locator('[data-id="logs-level-filter"]').click()
    await page.locator('[data-id="logs-level-filter-option-error"]').click()
    await expect(page.locator('[data-id="logs-line-4"]')).toBeVisible()
    await expect(page.locator('[data-id="logs-line-1"]')).toHaveCount(0)
    await expect(page.locator('[data-id="logs-line-3"]')).toHaveCount(0)

    await page.locator('[data-id="logs-viewer-close"]').click()
    await expect(batchPage.logsViewer).toHaveCount(0)
  })

  test('shows an empty state when the iteration has no log artifacts', async ({ page }) => {
    // Re-route the file list without the log artifact (newest route wins).
    await page.route('**/api/iterations/i1/files', async (route) => {
      await route.fulfill({
        json: [
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
        ],
      })
    })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLogs('i1').click()
    await expect(batchPage.logsViewer).toBeVisible()
    await expect(page.locator('[data-id="logs-viewer-empty"]')).toBeVisible()
    await expect(page.locator('[data-id="logs-search"]')).toHaveCount(0)
  })

  test('logs button is disabled for queued iterations', async ({ page }) => {
    await page.route('**/api/batches/b1/snapshot', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          message: 'snapshot',
          statusCode: 200,
          data: {
            batch: { id: 'b1', name: 'web-nav', status: 'executing', models: 'gpt' },
            executions: [{ id: 'e1', status: 'pending', taskId: 't1', modelId: 'm1', snapshotTaskId: 'checkout', snapshotPrompt: 'do it' }],
            iterations: [{ id: 'i1', executionId: 'e1', status: 'pending', iterationNumber: 1, totalSteps: 0, cost: 0 }],
            counts: { total: 1, pending: 1 },
            report: { status: 'not_configured' },
            catalog: { gyms: {}, tasks: {}, models: {} },
          },
        },
      })
    })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await expect(batchPage.snapshotPage).toBeVisible()
    await expect(batchPage.openLogs('i1')).toBeDisabled()
  })

  test('autoscroll toggles, no-match state, and View raw opens a tab', async ({ page }) => {
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLogs('i1').click()
    await expect(batchPage.logsViewer).toBeVisible()

    // Auto-scroll is on by default and toggles off.
    const autoScroll = page.locator('[data-id="logs-autoscroll"]')
    await expect(autoScroll).toHaveAttribute('aria-pressed', 'true')
    await autoScroll.click()
    await expect(autoScroll).toHaveAttribute('aria-pressed', 'false')

    // A search that matches nothing shows the no-match state.
    await page.locator('[data-id="logs-search"]').fill('zzz-nonexistent-token')
    await expect(page.locator('[data-id="logs-no-match"]')).toBeVisible()
    await page.locator('[data-id="logs-search"]').fill('')

    // View raw opens the raw log artifact in a new tab (redirected to the blob).
    const popupPromise = page.waitForEvent('popup')
    await page.locator('[data-id="logs-view-raw"]').click()
    const popup = await popupPromise
    await expect.poll(() => popup.url()).toContain('blob:')
    await popup.close()
  })

  test('streams new log lines live, driven by batch SSE events (no polling)', async ({ page }) => {
    await installMockEventSource(page)
    // The growing log: the first fetch (on open) has one line; a later fetch —
    // triggered only by an SSE event — includes the new line.
    let calls = 0
    await page.route('**/api/artifacts/log-1', async (route) => {
      calls += 1
      const lines = ['2026-01-01T00:00:00Z INFO starting iteration i1']
      if (calls > 1) lines.push('2026-01-01T00:00:05Z INFO action 2: openai click')
      await route.fulfill({ body: lines.join('\n'), contentType: 'text/plain' })
    })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLogs('i1').click()
    await expect(batchPage.logsViewer).toBeVisible()
    await expect(page.locator('[data-id="logs-live-indicator"]')).toBeVisible()
    await expect(page.locator('[data-id="logs-line-1"]')).toContainText('starting iteration')

    // A batch SSE event for this iteration (a new step artifact) triggers a
    // single refetch — the new line appears without reopening or polling.
    await page.evaluate(() => {
      ;(window as unknown as { __emitBatchEvent: (type: string, data: unknown, lastEventId: string) => void }).__emitBatchEvent(
        'artifact.created',
        {
          version: 'v1',
          type: 'artifact.created',
          id: 'b1:evt-1',
          batch_id: 'b1',
          iteration_id: 'i1',
          occurred_at: '2026-01-01T00:00:05Z',
          sequence: '2-0',
          payload: { artifactId: 'after-9', artifactType: 'screenshot', scope: 'iterations/i1', filename: 'step-9-after.png' },
        },
        '2-0',
      )
    })

    await expect(page.locator('[data-id="logs-line-2"]')).toContainText('action 2')
  })

  test('windows very large logs and surfaces a truncation notice', async ({ page }) => {
    // 2100 lines exceeds MAX_RENDERED_LINES (2000); only the latest 2000 render.
    await page.route('**/api/artifacts/log-1', async (route) => {
      const body = Array.from({ length: 2100 }, (_, index) => `2026-01-01T00:00:00Z INFO line ${index + 1}`).join('\n')
      await route.fulfill({ body, contentType: 'text/plain' })
    })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLogs('i1').click()
    await expect(batchPage.logsViewer).toBeVisible()

    await expect(page.locator('[data-id="logs-truncation-notice"]')).toBeVisible()
    await expect(page.locator('[data-id="logs-line-2100"]')).toBeVisible()
    await expect(page.locator('[data-id="logs-line-1"]')).toHaveCount(0)
  })

  test('surfaces an error state when the log fails to load', async ({ page }) => {
    await page.route('**/api/artifacts/log-1', async (route) => {
      await route.fulfill({ status: 500, body: 'boom' })
    })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLogs('i1').click()
    await expect(batchPage.logsViewer).toBeVisible()
    await expect(page.locator('[data-id="logs-viewer-error"]')).toBeVisible()
  })

  test('offers a file picker when the iteration has multiple log artifacts', async ({ page }) => {
    await page.route('**/api/iterations/i1/files', async (route) => {
      await route.fulfill({
        json: [
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
            id: 'log-2',
            scope: 'iterations/i1',
            artifactType: 'log',
            objectKey: 'iterations/i1/logs/browser.log',
            sizeBytes: 12,
            contentHash: 'hash-log-2',
            metadata: { filename: 'browser.log', contentType: 'text/plain' },
            createdAt: '2026-01-01T00:00:04Z',
          },
        ],
      })
    })
    await page.route('**/api/artifacts/log-2', async (route) => {
      await route.fulfill({ body: '2026-01-01T00:00:05Z INFO browser log line', contentType: 'text/plain' })
    })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLogs('i1').click()
    await expect(batchPage.logsViewer).toBeVisible()
    await expect(page.locator('[data-id="logs-file-select"]')).toBeVisible()
  })
})
