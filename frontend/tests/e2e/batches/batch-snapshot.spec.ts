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
    await expect(page.locator('[data-id="batches-status-filter"]')).toBeVisible()
    await expect(batchPage.addBatchButton).toBeVisible()
    await expect(batchPage.batchesSearch).toBeVisible()
    await expect(batchPage.batchFormCard).not.toBeVisible()
    await batchPage.addBatchButton.click()
    await expect(batchPage.batchFormCard).toBeVisible()
    await expect(batchPage.batchCard(mockBatch.id)).toBeVisible()
    await expect(page.locator('[data-id="batch-model-b1"]')).toContainText('Local Test Model')
    await expect(page.locator('[data-id="batch-passrate-b1"]')).toContainText('50%')
    await expect(page.locator('[data-id="batch-cost-b1"]')).toContainText('$1.23')

    await page.goto('/batches/b1/runs')
    await expect(batchPage.snapshotPage).toBeVisible()
    await expect(batchPage.snapshotBackToBatches).toBeVisible()
    await expect(page.locator('[data-id="event-connection-state"]')).toBeVisible()
    await expect(page.locator('[data-id="batch-snapshot-status"]')).toHaveText('pending')
    await expect(page.locator('[data-id="snapshot-reload-button"]')).toBeVisible()
    await expect(page.locator('[data-id="terminate-batch-button"]')).toBeEnabled()
    await expect(page.locator('[data-id="snapshot-count-total"]')).toBeVisible()
    await expect(page.locator('[data-id="snapshot-progress-bar"]')).toBeVisible()
    await expect(page.locator('[data-id="failure-diagnostics-panel"]')).toBeVisible()
    await expect(page.locator('[data-id="batch-insights-tabs"]')).toBeVisible()
    await expect(page.locator('[data-id="iterations-status-filter"]')).toBeVisible()
    await expect(batchPage.snapshotIteration('i1')).toBeVisible()
    await expect(page.locator('[data-id="snapshot-iteration-title-i1"]')).toContainText('TASK-1')
    await expect(page.locator('[data-id="snapshot-iteration-title-i1"]')).toContainText('#1')
    await expect(page.locator('[data-id="snapshot-iteration-model-i1"]')).toContainText('Local Test Model')
    await expect(page.locator('[data-id="snapshot-iteration-prompt-i1"]')).toContainText('Do the thing')
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

  test('updates iteration status from live SSE events', async ({ page }) => {
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
    await expect(page.locator('[data-id="snapshot-iteration-status-i1"]')).toHaveText('executing')

    await page.evaluate(() => {
      ;(window as unknown as { __emitBatchEvent: (type: string, data: unknown, lastEventId: string) => void }).__emitBatchEvent(
        'iteration.completed',
        {
          version: 'v1',
          type: 'iteration.completed',
          id: 'b1:event-1',
          batch_id: 'b1',
          iteration_id: 'i1',
          occurred_at: '2026-01-01T00:00:00Z',
          sequence: '1-0',
          payload: { status: 'passed' },
        },
        '1-0',
      )
    })

    await expect(page.locator('[data-id="snapshot-iteration-status-i1"]')).toHaveText('passed')
  })
})
