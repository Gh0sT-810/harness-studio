import { expect, Locator, test } from '@playwright/test'

import { mockPhase2Api, seedAuthenticatedState } from '../helpers/mock-api'
import { BatchPage } from '../pages/BatchPage'

async function expectScreenshotDecoded(locator: Locator) {
  await expect
    .poll(async () => locator.evaluate((image) => {
      const screenshot = image as HTMLImageElement
      return screenshot.naturalWidth > 0 && screenshot.naturalHeight > 0
    }))
    .toBe(true)
}

async function expectCanvasBounded(canvas: Locator, monitor: Locator) {
  await expect
    .poll(async () => {
      const [canvasBox, monitorBox] = await Promise.all([canvas.boundingBox(), monitor.boundingBox()])
      return {
        canvasHeight: Math.round(canvasBox?.height ?? 0),
        monitorHeight: Math.round(monitorBox?.height ?? 0),
      }
    })
    .toEqual(expect.objectContaining({
      canvasHeight: expect.any(Number),
      monitorHeight: expect.any(Number),
    }))

  const canvasBox = await canvas.boundingBox()
  const monitorBox = await monitor.boundingBox()
  expect(canvasBox?.height ?? 0).toBeLessThanOrEqual((monitorBox?.height ?? 0) - 150)
}

async function expectScreenshotContained(screenshot: Locator, canvas: Locator) {
  const screenshotBox = await screenshot.boundingBox()
  const canvasBox = await canvas.boundingBox()
  expect(screenshotBox?.height ?? 0).toBeLessThanOrEqual(canvasBox?.height ?? 0)
  expect(screenshotBox?.width ?? 0).toBeLessThanOrEqual(canvasBox?.width ?? 0)
}

async function expectStageMatchesImageAspectRatio(stage: Locator) {
  await expect
    .poll(async () =>
      stage.evaluate((element) => {
        const image = element.querySelector('[data-id="live-monitor-screenshot"]')
        if (!image || !(image instanceof HTMLImageElement) || image.naturalWidth === 0) return null
        const rect = element.getBoundingClientRect()
        if (rect.height === 0) return null
        const stageRatio = rect.width / rect.height
        const imageRatio = image.naturalWidth / image.naturalHeight
        return Math.abs(stageRatio - imageRatio)
      }),
    )
    .toBeLessThan(0.05)
}

async function expectCursorNearViewportPoint(cursor: Locator, stage: Locator, viewportX: number, viewportY: number, viewportWidth: number, viewportHeight: number) {
  const cursorBox = await cursor.boundingBox()
  const stageBox = await stage.boundingBox()
  expect(cursorBox).not.toBeNull()
  expect(stageBox).not.toBeNull()
  const cursorCenterX = (cursorBox?.x ?? 0) + (cursorBox?.width ?? 0) / 2
  const cursorCenterY = (cursorBox?.y ?? 0) + (cursorBox?.height ?? 0) / 2
  const expectedX = (stageBox?.x ?? 0) + (viewportX / viewportWidth) * (stageBox?.width ?? 0)
  const expectedY = (stageBox?.y ?? 0) + (viewportY / viewportHeight) * (stageBox?.height ?? 0)
  expect(Math.abs(cursorCenterX - expectedX)).toBeLessThan(24)
  expect(Math.abs(cursorCenterY - expectedY)).toBeLessThan(24)
}

test.describe('Live Monitor', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthenticatedState(page)
    await mockPhase2Api(page)
  })

  test('opens playback with timeline, browser replay, controls, and files', async ({ page }) => {
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await expect(batchPage.snapshotPage).toBeVisible()
    await batchPage.openLiveMonitor('i1').click()

    await expect(batchPage.liveMonitor).toBeVisible()
    await expect(batchPage.liveMonitor).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(batchPage.liveMonitor).toHaveCSS('border-top-color', 'rgb(229, 229, 229)')
    await expect(batchPage.liveMonitorTimeline).toBeVisible()
    await expect(batchPage.liveMonitorBrowser).toBeVisible()
    await expect(batchPage.liveMonitorSidePanel).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-playback-header"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-progress-label"]')).toHaveText('Action 5 of 5')
    await expect(page.locator('[data-id="live-monitor-scrubber"]')).not.toHaveJSProperty('tagName', 'INPUT')
    await expect(page.locator('[data-id="live-monitor-action-list"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-step-0"]')).toContainText('Captured browser state')
    await page.locator('[data-id="live-monitor-step-0"]').click()
    await expect(page.locator('[data-id="live-monitor-progress-label"]')).toHaveText('Action 1 of 5')
    await expect(page.locator('[data-id="live-monitor-url"]')).toContainText('https://example.com')
    await expect(page.locator('[data-id="live-monitor-play"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-speed-1"]')).toBeVisible()
    // Right panel: the Timeline section is open by default with its View JSON
    // button; every other artifact group is a collapsed section (body absent).
    await expect(batchPage.liveMonitorTimelineActivity).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-timeline-view-json"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-section-log"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-section-conversation"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-section-task_response"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-section-verification"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-section-log-body"]')).toHaveCount(0)
    // Expanding a collapsed group reveals its file links.
    await page.locator('[data-id="live-monitor-section-log"]').click()
    await expect(page.locator('[data-id="live-monitor-section-log-body"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-file-log-1"]')).toContainText('execution.log')
    const screenshot = page.locator('[data-id="live-monitor-screenshot"]')
    await expect(screenshot).toBeVisible()
    // Browsing defaults to the "before" frame ("What will be performed").
    await expect(screenshot).toHaveAttribute('alt', 'before screenshot')
    await expectScreenshotDecoded(screenshot)
    const screenshotCanvas = page.locator('[data-id="live-monitor-screenshot-canvas"]')
    await expectCanvasBounded(screenshotCanvas, batchPage.liveMonitor)
    await expectScreenshotContained(screenshot, screenshotCanvas)
    await expectStageMatchesImageAspectRatio(page.locator('[data-id="live-monitor-screenshot-stage"]'))
    // The navigate step has no tracked or inferable cursor yet.
    await expect(page.locator('[data-id="live-monitor-mouse-cursor"]')).toHaveCount(0)

    // The navigate step is self-complete: its after frame IS the loaded page.
    const beforeSource = await screenshot.getAttribute('src')
    await page.locator('[data-id="live-monitor-after"]').click()
    await expect(screenshot).toHaveAttribute('alt', 'after screenshot')
    await expect(screenshot).toHaveAttribute('src', beforeSource ?? '')
    await expectScreenshotDecoded(screenshot)

    await page.locator('[data-id="live-monitor-step-1"]').click()
    await expect(page.locator('[data-id="live-monitor-progress-label"]')).toHaveText('Action 2 of 5')
    await expect(page.locator('[data-id="live-monitor-before"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-after"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-action-footer"]')).toContainText('click')
    // Browsing default lands on the "before" frame with the action overlays.
    await expect(screenshot).toHaveAttribute('alt', 'before screenshot')
    await expectScreenshotDecoded(screenshot)
    await expect(page.locator('[data-id="live-monitor-coordinate-overlay"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-browser-chrome"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-screenshot-stage"]')).toBeVisible()
    // Single-pointer rule: the action overlay carries no arrow glyph of its own.
    await expect(page.locator('[data-id="live-monitor-cursor-icon"]')).toHaveCount(0)
    await expect(page.locator('[data-id="live-monitor-coordinate-chip"]')).toContainText('(640, 360)')
    await expect(page.locator('[data-id="live-monitor-coordinate-overlay"]')).toContainText('(640, 360)')
    await expectCursorNearViewportPoint(
      page.locator('[data-id="live-monitor-coordinate-overlay"]'),
      page.locator('[data-id="live-monitor-screenshot-stage"]'),
      640,
      360,
      1280,
      800,
    )
    // Switch to the after frame: the tracked mouse cursor sits where the click landed.
    const beforeStepSource = await screenshot.getAttribute('src')
    await page.locator('[data-id="live-monitor-after"]').click()
    await expect(screenshot).toHaveAttribute('alt', 'after screenshot')
    await expect(screenshot).not.toHaveAttribute('src', beforeStepSource ?? '')
    await expectScreenshotDecoded(screenshot)
    await expect(page.locator('[data-id="live-monitor-mouse-cursor"]')).toBeVisible()
    await expectCursorNearViewportPoint(
      page.locator('[data-id="live-monitor-mouse-cursor"]'),
      page.locator('[data-id="live-monitor-screenshot-stage"]'),
      640,
      360,
      1280,
      800,
    )
    await expectCanvasBounded(screenshotCanvas, batchPage.liveMonitor)
    await expectScreenshotContained(screenshot, screenshotCanvas)
  })

  test('mouse cursor persists across keyboard steps and survives overlay toggle', async ({ page }) => {
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLiveMonitor('i1').click()
    await expect(batchPage.liveMonitor).toBeVisible()

    // Keyboard-only step: no coordinates, but the cursor persists from the click.
    await page.locator('[data-id="live-monitor-step-2"]').click()
    await expect(page.locator('[data-id="live-monitor-action-footer"]')).toContainText('keypress')
    await expect(page.locator('[data-id="live-monitor-key-chip"]')).toContainText('ctrl+a')
    await expect(page.locator('[data-id="live-monitor-coordinate-chip"]')).toHaveCount(0)
    const mouseCursor = page.locator('[data-id="live-monitor-mouse-cursor"]')
    await expect(mouseCursor).toBeVisible()
    await expect(mouseCursor).toHaveCount(1)
    await expectCursorNearViewportPoint(
      mouseCursor,
      page.locator('[data-id="live-monitor-screenshot-stage"]'),
      640,
      360,
      1280,
      800,
    )

    // Action overlays are toggleable; a click before-frame has the action ring,
    // but no tracked cursor until the after-frame records where it landed.
    await page.locator('[data-id="live-monitor-step-1"]').click()
    await page.locator('[data-id="live-monitor-before"]').click()
    await expect(page.locator('[data-id="live-monitor-coordinate-overlay"]')).toBeVisible()
    // Exactly one pointer on screen even with the action ring showing.
    await expect(page.locator('[data-id="live-monitor-cursor-icon"]')).toHaveCount(0)
    await page.locator('[data-id="live-monitor-overlay-toggle"]').click()
    await expect(page.locator('[data-id="live-monitor-coordinate-overlay"]')).toHaveCount(0)
    await expect(mouseCursor).toHaveCount(0)
    await page.locator('[data-id="live-monitor-overlay-toggle"]').click()
    await expect(page.locator('[data-id="live-monitor-coordinate-overlay"]')).toBeVisible()
  })

  test('legacy full-page artifacts render un-cropped with a persisted cursor', async ({ page }) => {
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLiveMonitor('i1').click()
    await expect(batchPage.liveMonitor).toBeVisible()

    await page.locator('[data-id="live-monitor-step-3"]').click()
    await expect(page.locator('[data-id="live-monitor-action-footer"]')).toContainText('legacy full-page frame')
    const screenshot = page.locator('[data-id="live-monitor-screenshot"]')
    await expect(screenshot).toHaveAttribute('alt', 'before screenshot')
    await expectScreenshotDecoded(screenshot)
    const screenshotCanvas = page.locator('[data-id="live-monitor-screenshot-canvas"]')
    // The tall frame is fully contained (no cover-crop), and the stage keeps its ratio.
    await expectStageMatchesImageAspectRatio(page.locator('[data-id="live-monitor-screenshot-stage"]'))
    await expectScreenshotContained(screenshot, screenshotCanvas)
    // Cursor persists from the most recent tracked position.
    await expect(page.locator('[data-id="live-monitor-mouse-cursor"]')).toBeVisible()
  })

  test('holds the previous frame between steps with no loading flash', async ({ page }) => {
    // Re-mock with artificial latency on screenshot artifacts (newest routes win).
    await mockPhase2Api(page, { artifactDelayMs: 800 })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLiveMonitor('i1').click()
    await expect(batchPage.liveMonitor).toBeVisible()

    const screenshot = page.locator('[data-id="live-monitor-screenshot"]')
    const status = page.locator('[data-id="live-monitor-screenshot-status"]')
    await expectScreenshotDecoded(screenshot)
    const initialSrc = await screenshot.getAttribute('src')
    const cursorHandle = await page.locator('[data-id="live-monitor-mouse-cursor"]').elementHandle()
    expect(cursorHandle).not.toBeNull()

    await page.locator('[data-id="live-monitor-step-2"]').click()
    // While the next frame loads, the previous frame is held: no status panel,
    // the image stays visible, and the chrome shows a subtle fetch indicator.
    await expect(page.locator('[data-id="live-monitor-frame-loading"]')).toBeVisible()
    await expect(status).toHaveCount(0)
    await expect(screenshot).toBeVisible()
    // The swap happens only once the new frame is decoded.
    await expect.poll(async () => screenshot.getAttribute('src'), { timeout: 10_000 }).not.toBe(initialSrc)
    await expectScreenshotDecoded(screenshot)
    await expect(status).toHaveCount(0)
    await expect(page.locator('[data-id="live-monitor-frame-loading"]')).toHaveCount(0)
    // The cursor element never unmounted across the transition.
    expect(await cursorHandle?.evaluate((element) => element.isConnected)).toBe(true)
  })

  test('serves revisits from cache and prefetches neighbor frames', async ({ page }) => {
    const artifactRequests: string[] = []
    page.on('request', (request) => {
      const match = request.url().match(/\/api\/artifacts\/([\w-]+)$/)
      if (match) artifactRequests.push(match[1])
    })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLiveMonitor('i1').click()
    await expect(batchPage.liveMonitor).toBeVisible()

    await page.locator('[data-id="live-monitor-step-1"]').click()
    const screenshot = page.locator('[data-id="live-monitor-screenshot"]')
    await expectScreenshotDecoded(screenshot)
    // Neighbor steps are prefetched without ever being selected.
    await expect
      .poll(() => artifactRequests.includes('before-3') && artifactRequests.includes('after-3'))
      .toBe(true)

    // Toggling after/before repeatedly fetches each frame at most once
    // (the other-variant prefetch and the toggles share deduplicated requests).
    await page.locator('[data-id="live-monitor-after"]').click()
    await expect(screenshot).toHaveAttribute('alt', 'after screenshot')
    await expectScreenshotDecoded(screenshot)
    await page.locator('[data-id="live-monitor-before"]').click()
    await expectScreenshotDecoded(screenshot)
    await page.locator('[data-id="live-monitor-after"]').click()
    await expect(screenshot).toHaveAttribute('alt', 'after screenshot')
    await expectScreenshotDecoded(screenshot)
    expect(artifactRequests.filter((artifactId) => artifactId === 'before-2')).toHaveLength(1)
    expect(artifactRequests.filter((artifactId) => artifactId === 'after-2')).toHaveLength(1)
  })

  test('shows retry only when no frame is held and recovers on retry', async ({ page }) => {
    let failuresRemaining = 1
    await page.route('**/api/artifacts/after-1', async (route) => {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1
        await route.fulfill({ status: 500, body: 'boom' })
        return
      }
      await route.fallback()
    })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLiveMonitor('i1').click()

    // Live follow opens on the terminal step; its first frame fails with nothing held.
    await expect(page.locator('[data-id="live-monitor-screenshot-status"]')).toHaveText('Screenshot failed to load.')
    await page.locator('[data-id="live-monitor-screenshot-retry"]').click()
    const screenshot = page.locator('[data-id="live-monitor-screenshot"]')
    await expect(screenshot).toBeVisible()
    await expectScreenshotDecoded(screenshot)
    await expect(page.locator('[data-id="live-monitor-screenshot-retry"]')).toHaveCount(0)
  })

  test('completed iteration opens on the loaded page, not the final screen', async ({ page }) => {
    const artifactRequests: string[] = []
    page.on('request', (request) => {
      const match = request.url().match(/\/api\/artifacts\/([\w-]+)$/)
      if (match) artifactRequests.push(match[1])
    })
    // Re-mock as a completed run (newest routes win).
    await mockPhase2Api(page, { iterationStatus: 'passed' })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLiveMonitor('i1').click()
    await expect(batchPage.liveMonitor).toBeVisible()

    await expect(page.locator('[data-id="live-monitor-progress-label"]')).toHaveText('Action 1 of 5')
    const screenshot = page.locator('[data-id="live-monitor-screenshot"]')
    await expect(screenshot).toHaveAttribute('alt', 'before screenshot')
    await expectScreenshotDecoded(screenshot)
    await expect(page.locator('[data-id="live-monitor-url"]')).toContainText('https://example.com')
    // The very first frame fetched is the loaded page, never the final screen.
    expect(artifactRequests[0]).toBe('before-1')
  })

  test('live follow opens on the newest frame as the current screen', async ({ page }) => {
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLiveMonitor('i1').click()
    await expect(batchPage.liveMonitor).toBeVisible()

    await expect(page.locator('[data-id="live-monitor-progress-label"]')).toHaveText('Action 5 of 5')
    await expect(page.locator('[data-id="live-monitor-action-footer"]')).toContainText('Final state')
    const screenshot = page.locator('[data-id="live-monitor-screenshot"]')
    await expect(screenshot).toHaveAttribute('alt', 'after screenshot')
    await expectScreenshotDecoded(screenshot)
    // The terminal step carries the final cursor position.
    await expect(page.locator('[data-id="live-monitor-mouse-cursor"]')).toBeVisible()
  })

  test('right side panel scrolls to reach lower artifact sections', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 560 })
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLiveMonitor('i1').click()
    await expect(batchPage.liveMonitor).toBeVisible()

    const panel = page.locator('[data-id="live-monitor-side-panel"]')
    // Expand a lower artifact group so the panel content exceeds its height.
    await page.locator('[data-id="live-monitor-section-screenshot"]').click()
    // The panel is a single bounded scroll container: sections keep their full
    // height (no invisible clipping) and the panel scrolls to reveal them.
    await expect.poll(() => panel.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
    // The last screenshot file (well below the fold) is reachable by scrolling.
    const lastFile = page.locator('[data-id="live-monitor-file-after-4"]')
    await lastFile.scrollIntoViewIfNeeded()
    await expect(lastFile).toBeVisible()
    expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  })

  test('timeline activity panel shows reasoning, syncs with playback, filters, and opens raw JSON', async ({ page }) => {
    const batchPage = new BatchPage(page)

    await page.goto('/batches/b1/runs')
    await batchPage.openLiveMonitor('i1').click()
    await expect(batchPage.liveMonitor).toBeVisible()

    // Selecting the click step (left timeline) drives the synced activity panel:
    // the detail block shows that step's reasoning, and its row is highlighted.
    await page.locator('[data-id="live-monitor-step-1"]').click()
    await expect(page.locator('[data-id="live-monitor-progress-label"]')).toHaveText('Action 2 of 5')
    await expect(page.locator('[data-id="live-monitor-activity-reasoning"]')).toContainText('Add to cart')
    await expect(page.locator('[data-id="live-monitor-activity-step-1"]')).toHaveAttribute('aria-current', 'true')

    // Steps without captured reasoning fall back to the step message.
    await page.locator('[data-id="live-monitor-step-0"]').click()
    await expect(page.locator('[data-id="live-monitor-activity-reasoning"]')).toContainText('Captured browser state')

    // Clicking an activity row navigates playback (and the browser replay) in lockstep.
    await page.locator('[data-id="live-monitor-activity-step-2"]').click()
    await expect(page.locator('[data-id="live-monitor-progress-label"]')).toHaveText('Action 3 of 5')
    await expect(page.locator('[data-id="live-monitor-action-footer"]')).toContainText('keypress')

    // The filter narrows the thread to matching steps.
    await page.locator('[data-id="live-monitor-timeline-filter"]').fill('keypress')
    await expect(page.locator('[data-id="live-monitor-activity-step-2"]')).toBeVisible()
    await expect(page.locator('[data-id="live-monitor-activity-step-0"]')).toHaveCount(0)
    await page.locator('[data-id="live-monitor-timeline-filter"]').fill('')

    // View JSON opens the raw timeline artifact in a new tab and redirects it to
    // the fetched blob (so it does not rely on the popup blocker being disabled).
    const popupPromise = page.waitForEvent('popup')
    await page.locator('[data-id="live-monitor-timeline-view-json"]').click()
    const popup = await popupPromise
    await expect.poll(() => popup.url()).toContain('blob:')
    await popup.close()
  })
})
