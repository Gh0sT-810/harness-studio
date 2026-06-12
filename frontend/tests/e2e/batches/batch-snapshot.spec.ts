import { expect, test } from '@playwright/test'

import { mockBatch, mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'
import { BatchPage } from '../pages/BatchPage'

test.describe('Batch Snapshot', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('renders consolidated snapshot data without polling-specific UI', async ({ page }) => {
    const batchPage = new BatchPage(page)

    await page.goto('/batches')
    await expect(batchPage.batchesPage).toBeVisible()
    await expect(batchPage.batchesHeaderSection).toContainText('Batches')
    await expect(batchPage.batchesActionsSection).toHaveClass(/harness-actions-section/)
    await expect(batchPage.batchesActionsLabel).toHaveText('Actions:')
    await expect(batchPage.addBatchButton).toBeVisible()
    await expect(batchPage.batchesSearch).toBeVisible()
    await expect(batchPage.batchFormCard).not.toBeVisible()
    await batchPage.addBatchButton.click()
    await expect(batchPage.batchFormCard).toBeVisible()
    await expect(batchPage.batchCard(mockBatch.id)).toBeVisible()

    await page.goto('/batches/b1/runs')
    await expect(batchPage.snapshotPage).toBeVisible()
    await expect(batchPage.snapshotBackToBatches).toBeVisible()
    await expect(page.locator('[data-id="event-connection-state"]')).toBeVisible()
    await expect(page.locator('[data-id="batch-snapshot-status"]')).toHaveText('pending')
    await expect(page.locator('[data-id="snapshot-reload-button"]')).toBeVisible()
    await expect(page.locator('[data-id="terminate-batch-button"]')).toBeEnabled()
    await expect(page.locator('[data-id="snapshot-count-total"]')).toBeVisible()
    await expect(page.locator('[data-id="failure-diagnostics-panel"]')).toBeVisible()
    await expect(page.locator('[data-id="batch-insights-tabs"]')).toBeVisible()
    await expect(page.locator('[data-id="event-stream-panel"]')).toBeVisible()
    await expect(page.locator('.harness-code-block-header')).toBeVisible()
    await expect(batchPage.snapshotExecution('e1')).toBeVisible()
    await expect(batchPage.snapshotIteration('i1')).toBeVisible()
    await expect(page.locator('[data-id="snapshot-iteration-title-i1"]')).toContainText('TASK-1')
    await expect(page.locator('[data-id="snapshot-iteration-title-i1"]')).toContainText('Iteration 1')
    await expect(page.locator('[data-id="snapshot-iteration-model-i1"]')).toContainText('Local Test Model')
    await expect(page.locator('[data-id="snapshot-iteration-prompt-i1"]')).toContainText('Do the thing')
    await expect(page.locator('[data-id="snapshot-iteration-execution-i1"]')).toContainText('execution=e1')
    const cancelRequest = page.waitForResponse('**/api/batches/b1/cancel')
    await page.locator('[data-id="terminate-batch-button"]').click()
    await cancelRequest
    await expect(page.locator('[data-id="terminate-batch-button"]')).toBeDisabled()
    await expect(page.locator('[data-id="batch-snapshot-status"]')).toHaveText('cancelled')
    await expect(page.locator('[data-id="snapshot-iteration-status-i1"]')).toHaveText('cancelled')
    await batchPage.snapshotBackToBatches.click()
    await expect(page).toHaveURL('/batches')
    await expect(batchPage.batchesPage).toBeVisible()
  })

  test('updates execution status from live SSE events', async ({ page }) => {
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

    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await expect(batchPage.snapshotPage).toBeVisible()
    await expect(page.locator('[data-id="snapshot-execution-status-e1"]')).toHaveText('pending')

    await page.evaluate(() => {
      ;(window as unknown as { __emitBatchEvent: (type: string, data: unknown, lastEventId: string) => void }).__emitBatchEvent(
        'execution.updated',
        {
          version: 'v1',
          type: 'execution.updated',
          id: 'b1:event-1',
          batch_id: 'b1',
          occurred_at: '2026-01-01T00:00:00Z',
          sequence: '1-0',
          payload: { execution_id: 'e1', status: 'passed' },
        },
        '1-0',
      )
    })

    await expect(page.locator('[data-id="snapshot-execution-status-e1"]')).toHaveText('passed')
    await expect(page.locator('[data-id="recent-event-b1:event-1"]')).toContainText('execution.updated')
    await expect(page.locator('[data-id="latest-event-id"]')).toHaveText('1-0')
  })
})
