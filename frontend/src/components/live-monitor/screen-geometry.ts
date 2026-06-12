import { CaptureMetadata, TimelineStep } from '@/lib/artifacts'

export type Size = {
  width: number
  height: number
}

export type StagePoint = {
  x: number
  y: number
}

export type ViewportPoint = {
  x: number
  y: number
  normalized: boolean
}

export type NormalizedCapture = {
  viewport: Size | null
  screenshot: {
    fullPage: boolean
    scrollX: number
    scrollY: number
    deviceScaleFactor: number
  }
  cursor: {
    coordinateBasis: string
    x?: number
    y?: number
    visible: boolean
  }
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function normalizeCapture(capture: CaptureMetadata | undefined): NormalizedCapture {
  const viewportWidth = finiteNumber(capture?.viewport?.width)
  const viewportHeight = finiteNumber(capture?.viewport?.height)
  return {
    viewport:
      viewportWidth && viewportHeight && viewportWidth > 0 && viewportHeight > 0
        ? { width: viewportWidth, height: viewportHeight }
        : null,
    screenshot: {
      fullPage: capture?.screenshot?.fullPage ?? false,
      scrollX: finiteNumber(capture?.screenshot?.scrollX) ?? 0,
      scrollY: finiteNumber(capture?.screenshot?.scrollY) ?? 0,
      deviceScaleFactor: finiteNumber(capture?.screenshot?.deviceScaleFactor) || 1,
    },
    cursor: {
      coordinateBasis: capture?.cursor?.coordinateBasis ?? 'viewport',
      x: finiteNumber(capture?.cursor?.x),
      y: finiteNumber(capture?.cursor?.y),
      visible: capture?.cursor?.visible === true,
    },
  }
}

/**
 * Largest box with the natural image's aspect ratio that fits the container.
 * The stage is sized to this box, so the rendered image content fills the
 * stage exactly: no hidden letterboxing, overlay math is a plain ratio.
 */
export function containFit(natural: Size | null, container: Size | null): Size | null {
  if (!natural || !container || natural.width <= 0 || natural.height <= 0) return null
  if (container.width <= 0 || container.height <= 0) return null
  const scale = Math.min(container.width / natural.width, container.height / natural.height)
  return {
    width: Math.max(1, Math.floor(natural.width * scale)),
    height: Math.max(1, Math.floor(natural.height * scale)),
  }
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Maps a point into stage pixels.
 *
 * - normalized points are on the provider 0-1000 grid;
 * - viewport-pixel points divide by the capture viewport when present,
 *   falling back to the image's natural size divided by deviceScaleFactor;
 * - legacy full-page artifacts (capture.screenshot.fullPage) shift
 *   viewport-based points by scrollX/scrollY into image space first.
 */
export function toStagePoint(
  point: ViewportPoint | null,
  capture: NormalizedCapture,
  natural: Size | null,
  stage: Size | null,
): StagePoint | null {
  if (!point || !stage || stage.width <= 0 || stage.height <= 0) return null
  if (point.normalized) {
    return {
      x: clampRatio(point.x / 1000) * stage.width,
      y: clampRatio(point.y / 1000) * stage.height,
    }
  }
  const dpr = capture.screenshot.deviceScaleFactor
  if (capture.screenshot.fullPage && natural && natural.width > 0 && natural.height > 0) {
    const imageX = (point.x + capture.screenshot.scrollX) * dpr
    const imageY = (point.y + capture.screenshot.scrollY) * dpr
    return {
      x: clampRatio(imageX / natural.width) * stage.width,
      y: clampRatio(imageY / natural.height) * stage.height,
    }
  }
  const denominatorWidth = capture.viewport?.width ?? (natural ? natural.width / dpr : 0)
  const denominatorHeight = capture.viewport?.height ?? (natural ? natural.height / dpr : 0)
  if (!denominatorWidth || !denominatorHeight) return null
  return {
    x: clampRatio(point.x / denominatorWidth) * stage.width,
    y: clampRatio(point.y / denominatorHeight) * stage.height,
  }
}

export function stepCoordinates(step: TimelineStep | undefined): (ViewportPoint & { label: string }) | null {
  const args = step?.args ?? {}
  const rawX = typeof args.x === 'number' ? args.x : undefined
  const rawY = typeof args.y === 'number' ? args.y : undefined
  const coordinates = Array.isArray(args.coordinates) ? args.coordinates : undefined
  const x = rawX ?? (typeof coordinates?.[0] === 'number' ? coordinates[0] : undefined)
  const y = rawY ?? (typeof coordinates?.[1] === 'number' ? coordinates[1] : undefined)
  if (x === undefined || y === undefined) return null
  const normalized = typeof args.coordinates_normalized === 'boolean' ? args.coordinates_normalized : false
  return { x, y, normalized, label: `(${x}, ${y})` }
}

export function dragPath(step: TimelineStep | undefined): ViewportPoint[] | null {
  const path = step?.args?.path
  if (!Array.isArray(path) || path.length < 2) return null
  const points: ViewportPoint[] = []
  for (const entry of path) {
    const record = entry as Record<string, unknown>
    const x = finiteNumber(record?.x)
    const y = finiteNumber(record?.y)
    if (x === undefined || y === undefined) return null
    points.push({ x, y, normalized: false })
  }
  return points
}

export function scrollDelta(step: TimelineStep | undefined): { x: number; y: number } | null {
  const args = step?.args ?? {}
  const x = finiteNumber(args.scroll_x) ?? finiteNumber(args.delta_x) ?? 0
  const y = finiteNumber(args.scroll_y) ?? finiteNumber(args.delta_y) ?? 0
  if (x === 0 && y === 0) return null
  return { x, y }
}

function cursorFromCapture(capture: CaptureMetadata | undefined): ViewportPoint | null {
  const normalized = normalizeCapture(capture)
  if (!normalized.cursor.visible) return null
  if (normalized.cursor.x === undefined || normalized.cursor.y === undefined) return null
  return { x: normalized.cursor.x, y: normalized.cursor.y, normalized: false }
}

/**
 * Resolves the mouse position for the displayed frame, like a real screen:
 * the cursor persists wherever it last was. Prefers tracked cursor capture
 * (before-frame: pre-action position; after-frame: post-action position),
 * then walks earlier steps, then falls back to the last pointer-action
 * coordinates for timelines recorded before cursor tracking existed.
 */
export function resolveCursorPoint(
  steps: TimelineStep[],
  selectedIndex: number,
  mode: 'before' | 'after',
): ViewportPoint | null {
  for (let index = Math.min(selectedIndex, steps.length - 1); index >= 0; index -= 1) {
    const step = steps[index]
    if (!step) continue
    const captures =
      index === selectedIndex && mode === 'before'
        ? [step.capture]
        : [step.captureAfter, step.capture]
    for (const capture of captures) {
      const cursor = cursorFromCapture(capture)
      if (cursor) return cursor
    }
  }
  const start = mode === 'after' ? selectedIndex : selectedIndex - 1
  for (let index = Math.min(start, steps.length - 1); index >= 0; index -= 1) {
    const coordinates = stepCoordinates(steps[index])
    if (coordinates) return coordinates
  }
  return null
}
