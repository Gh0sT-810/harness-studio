import { useEffect, useMemo, useRef, useState } from 'react'

import { CursorLayer } from '@/components/live-monitor/CursorLayer'
import {
  containFit,
  dragPath,
  normalizeCapture,
  resolveCursorPoint,
  scrollDelta,
  Size,
  stepCoordinates,
  toStagePoint,
} from '@/components/live-monitor/screen-geometry'
import { FrameSlot, useScreenshotFrame } from '@/components/live-monitor/use-screenshot-frame'
import { TimelineStep } from '@/lib/artifacts'
import { prefetchFrame } from '@/lib/frame-cache'

/**
 * Ditto screenshot stage: the stage box always has the screenshot's exact
 * aspect ratio (no hidden letterboxing or cropping), the tracked mouse
 * cursor is rendered on every frame, and action overlays (click ring, drag
 * arrow, scroll path, typing caret) can be toggled.
 *
 * Transitions are smooth by construction: the previous frame is held in a
 * double-buffered stage while the next frame is fetched and decoded, then
 * crossfaded in (see use-screenshot-frame.ts) — the stage never unmounts
 * between steps, so there is no loading flash mid-playback.
 */
export function BrowserReplay({
  steps,
  selectedIndex,
  isLiveFollowing = false,
}: {
  steps: TimelineStep[]
  selectedIndex: number
  isLiveFollowing?: boolean
}) {
  const step: TimelineStep | undefined = steps[selectedIndex]
  const [selection, setSelection] = useState<{ stepId: string | undefined; mode: 'before' | 'after' }>({ stepId: undefined, mode: 'after' })
  const [containerSize, setContainerSize] = useState<Size | null>(null)
  const [showOverlays, setShowOverlays] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const hasBefore = Boolean(step?.beforeArtifactId)
  const hasAfter = Boolean(step?.afterArtifactId)
  const hasBeforeAfter = hasBefore && hasAfter
  // Browsing defaults to "before" ("What will be performed", legacy parity);
  // live-follow shows the newest "after" — the screen as it is right now.
  const fallbackMode = isLiveFollowing ? 'after' : 'before'
  const selectedMode = selection.stepId === step?.id ? selection.mode : fallbackMode
  const effectiveMode = hasBeforeAfter ? selectedMode : hasAfter ? 'after' : 'before'
  const artifactId = effectiveMode === 'before' ? step?.beforeArtifactId : step?.afterArtifactId

  const frame = useScreenshotFrame(artifactId)
  const showError = frame.isError && !frame.shown
  const showNoScreenshot = !artifactId && !frame.shown

  // Keep the opposite variant of the current step warm for instant toggles.
  useEffect(() => {
    prefetchFrame(effectiveMode === 'before' ? step?.afterArtifactId : step?.beforeArtifactId)
  }, [effectiveMode, step?.afterArtifactId, step?.beforeArtifactId])

  useEffect(() => {
    const containerElement = containerRef.current
    if (!containerElement || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect && rect.width > 0 && rect.height > 0) {
        setContainerSize((current) => {
          if (current && current.width === rect.width && current.height === rect.height) {
            return current
          }
          return { width: rect.width, height: rect.height }
        })
      }
    })
    observer.observe(containerElement)
    return () => observer.disconnect()
  }, [])

  const naturalSize = useMemo<Size | null>(
    () => (frame.shown && frame.shown.width > 0 && frame.shown.height > 0 ? { width: frame.shown.width, height: frame.shown.height } : null),
    [frame.shown],
  )
  const capture = useMemo(
    () => normalizeCapture(effectiveMode === 'after' ? step?.captureAfter ?? step?.capture : step?.capture),
    [effectiveMode, step?.capture, step?.captureAfter],
  )
  const stage = useMemo(() => containFit(naturalSize, containerSize), [naturalSize, containerSize])
  const coordinates = useMemo(() => stepCoordinates(step), [step])
  const pointerPoint = useMemo(
    () => toStagePoint(coordinates, capture, naturalSize, stage),
    [capture, coordinates, naturalSize, stage],
  )
  const cursorViewportPoint = useMemo(
    () => resolveCursorPoint(steps, selectedIndex, effectiveMode),
    [effectiveMode, selectedIndex, steps],
  )
  const cursorPoint = useMemo(
    () => toStagePoint(cursorViewportPoint, capture, naturalSize, stage),
    [capture, cursorViewportPoint, naturalSize, stage],
  )
  const drag = useMemo(() => dragPath(step), [step])
  const dragPoints = useMemo(() => {
    if (!drag) return null
    const mapped = drag.map((point) => toStagePoint(point, capture, naturalSize, stage))
    return mapped.every((point) => point !== null) ? (mapped as { x: number; y: number }[]) : null
  }, [capture, drag, naturalSize, stage])
  const scroll = useMemo(() => scrollDelta(step), [step])

  const showActionOverlays = showOverlays && (!hasBeforeAfter || effectiveMode === 'before')
  const showPointer = Boolean(showActionOverlays && coordinates && pointerPoint && !dragPoints)
  const actionName = (step?.action ?? '').toLowerCase()
  const rawText = step?.args?.text
  const typedText = typeof rawText === 'string' ? rawText : ''
  const showTypeOverlay = Boolean(
    showActionOverlays && typedText && (actionName === 'type' || actionName === 'type_text') && cursorPoint,
  )
  const keyLabel = useMemo(() => {
    const keys = step?.args?.keys ?? step?.args?.key
    if (Array.isArray(keys)) return keys.join('+')
    if (typeof keys === 'string') return keys
    return ''
  }, [step?.args])

  const scrollOverlay = useMemo(() => {
    if (!showActionOverlays || !scroll || !pointerPoint || !stage) return null
    const vertical = Math.abs(scroll.y) >= Math.abs(scroll.x)
    const delta = vertical ? scroll.y : scroll.x
    const axisSize = vertical ? stage.height : stage.width
    const viewportSpan = vertical
      ? capture.viewport?.height ?? (naturalSize ? naturalSize.height / capture.screenshot.deviceScaleFactor : axisSize)
      : capture.viewport?.width ?? (naturalSize ? naturalSize.width / capture.screenshot.deviceScaleFactor : axisSize)
    const length = Math.max(24, Math.min(Math.abs(delta) * (axisSize / Math.max(viewportSpan, 1)), axisSize * 0.35))
    const direction = delta >= 0 ? 1 : -1
    const end = vertical
      ? { x: pointerPoint.x, y: Math.max(0, Math.min(stage.height, pointerPoint.y + direction * length)) }
      : { x: Math.max(0, Math.min(stage.width, pointerPoint.x + direction * length)), y: pointerPoint.y }
    const label = vertical
      ? `SCROLL ${direction > 0 ? 'DOWN' : 'UP'} (${Math.abs(scroll.y)}px)`
      : `SCROLL ${direction > 0 ? 'RIGHT' : 'LEFT'} (${Math.abs(scroll.x)}px)`
    return { start: pointerPoint, end, label }
  }, [capture, naturalSize, pointerPoint, scroll, showActionOverlays, stage])

  const shownSlotIndex = frame.incomingSlot ?? frame.activeSlot

  return (
    <section data-id="live-monitor-browser" className="harness-card-base grid h-full max-h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden">
      <div data-id="live-monitor-browser-chrome" className="border-b border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[var(--brand-error)]" />
          <span className="h-3 w-3 rounded-full bg-[var(--brand-warn)]" />
          <span className="h-3 w-3 rounded-full bg-[var(--brand-green)]" />
          <p data-id="live-monitor-url" className="harness-code-inline min-w-0 flex-1 overflow-hidden text-ellipsis">{step?.url ?? 'about:blank'}</p>
          {frame.isFetching ? (
            <span data-id="live-monitor-frame-loading" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--brand-cursor)]" aria-hidden="true" />
          ) : null}
          <button
            data-id="live-monitor-overlay-toggle"
            className={showOverlays ? 'harness-button-primary !px-2 !py-1 text-xs' : 'harness-button-secondary !px-2 !py-1 text-xs'}
            type="button"
            aria-pressed={showOverlays}
            onClick={() => setShowOverlays((current) => !current)}
          >
            Overlays
          </button>
        </div>
        <p className="harness-subtitle mt-2 truncate text-xs">{step?.title ?? step?.message ?? 'No title captured yet'}</p>
      </div>
      {hasBeforeAfter ? (
        <div data-id="live-monitor-before-after-toggle" className="flex items-center justify-between gap-2 border-b border-[var(--hairline)] p-3">
          <p className="harness-kicker">{effectiveMode === 'before' ? 'What will be performed' : 'What was performed'}</p>
          <div className="flex gap-2">
          <button data-id="live-monitor-before" className={selectedMode === 'before' ? 'harness-button-primary' : 'harness-button-secondary'} type="button" onClick={() => setSelection({ stepId: step?.id, mode: 'before' })}>Before</button>
          <button data-id="live-monitor-after" className={selectedMode === 'after' ? 'harness-button-primary' : 'harness-button-secondary'} type="button" onClick={() => setSelection({ stepId: step?.id, mode: 'after' })}>After</button>
          </div>
        </div>
      ) : null}
      <div
        ref={containerRef}
        data-id="live-monitor-screenshot-canvas"
        className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--surface-soft)] p-3"
      >
        {frame.isInitialLoading ? (
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <p data-id="live-monitor-screenshot-status" className="harness-subtitle">Loading screenshot...</p>
          </div>
        ) : null}
        {showError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3">
            <p data-id="live-monitor-screenshot-status" className="harness-subtitle">Screenshot failed to load.</p>
            <button data-id="live-monitor-screenshot-retry" className="harness-button-secondary" type="button" onClick={frame.retry}>
              Retry
            </button>
          </div>
        ) : null}
        {frame.shown && stage ? (
          <div
            data-id="live-monitor-screenshot-stage"
            className="relative overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] shadow-sm"
            style={{
              width: `${stage.width}px`,
              height: `${stage.height}px`,
              transition: 'width 150ms ease-out, height 150ms ease-out',
            }}
          >
            {([0, 1] as const).map((slotIndex) => (
              <FrameLayer
                key={slotIndex}
                slot={frame.slots[slotIndex]}
                isFront={slotIndex === shownSlotIndex}
                isIncoming={frame.incomingSlot === slotIndex}
                mode={effectiveMode}
                onShown={frame.completeTransition}
              />
            ))}
            {showPointer && coordinates && pointerPoint ? (
              <>
                {/* Pure action marker (ring + label): the mouse pointer is drawn
                    exclusively by CursorLayer, never duplicated here. */}
                <div
                  data-id="live-monitor-coordinate-overlay"
                  className="pointer-events-none absolute z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${pointerPoint.x}px`, top: `${pointerPoint.y}px` }}
                >
                  <span className="absolute inset-0 animate-pulse rounded-full border-[3px] border-[var(--brand-error)] bg-[color-mix(in_srgb,var(--brand-error)_16%,transparent)] shadow-[0_0_0_8px_color-mix(in_srgb,var(--brand-error)_16%,transparent)]" />
                  <span className="absolute left-8 top-[-1.875rem] rounded-md bg-[var(--brand-error)] px-2 py-1 font-mono text-[11px] font-semibold text-white shadow-md">
                    {coordinates.label}
                  </span>
                </div>
              </>
            ) : null}
            {showActionOverlays && dragPoints && stage ? (
              <svg
                data-id="live-monitor-drag-overlay"
                className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                viewBox={`0 0 ${stage.width} ${stage.height}`}
                aria-hidden="true"
              >
                <defs>
                  <marker id="lm-drag-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0 0L8 4L0 8Z" fill="var(--brand-green-deep)" />
                  </marker>
                </defs>
                <polyline
                  points={dragPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  stroke="var(--brand-green-deep)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd="url(#lm-drag-arrow)"
                />
                <circle cx={dragPoints[0].x} cy={dragPoints[0].y} r="5" fill="var(--brand-green-deep)" stroke="#ffffff" strokeWidth="2" />
              </svg>
            ) : null}
            {scrollOverlay && stage ? (
              <svg
                data-id="live-monitor-scroll-overlay"
                className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                viewBox={`0 0 ${stage.width} ${stage.height}`}
                aria-hidden="true"
              >
                <defs>
                  <marker id="lm-scroll-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M0 0L8 4L0 8Z" fill="var(--brand-warn)" />
                  </marker>
                </defs>
                <line
                  x1={scrollOverlay.start.x}
                  y1={scrollOverlay.start.y}
                  x2={scrollOverlay.end.x}
                  y2={scrollOverlay.end.y}
                  stroke="var(--brand-warn)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  markerEnd="url(#lm-scroll-arrow)"
                />
                <circle cx={scrollOverlay.start.x} cy={scrollOverlay.start.y} r="5" fill="var(--brand-warn)" stroke="#ffffff" strokeWidth="2" />
              </svg>
            ) : null}
            {scrollOverlay ? (
              <span
                className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md bg-[var(--brand-warn)] px-2 py-1 text-[11px] font-semibold text-white shadow-md"
                style={{ left: `${scrollOverlay.start.x}px`, top: `${Math.max(4, Math.min(scrollOverlay.start.y, scrollOverlay.end.y) - 28)}px` }}
              >
                {scrollOverlay.label}
              </span>
            ) : null}
            {showTypeOverlay && cursorPoint ? (
              <div
                data-id="live-monitor-type-overlay"
                className="pointer-events-none absolute z-10"
                style={{ left: `${cursorPoint.x}px`, top: `${cursorPoint.y}px` }}
              >
                <span className="absolute -top-3 block h-6 w-0.5 animate-pulse bg-[var(--brand-tag)]" />
                <span className="absolute left-3 top-[-1.875rem] max-w-52 truncate rounded-md bg-[var(--brand-tag)] px-2 py-1 font-mono text-[11px] font-semibold text-white shadow-md">
                  {`"${typedText.slice(0, 30)}${typedText.length > 30 ? '…' : ''}"`}
                </span>
              </div>
            ) : null}
            <CursorLayer point={cursorPoint} />
          </div>
        ) : null}
        {showNoScreenshot ? (
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <p data-id="live-monitor-screenshot-status" className="harness-subtitle">No screenshot available.</p>
          </div>
        ) : null}
      </div>
      <div data-id="live-monitor-action-footer" className="grid gap-2 border-t border-[var(--hairline)] bg-[var(--canvas)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{step?.action ?? step?.type ?? 'No action selected'}</p>
            {coordinates ? <span data-id="live-monitor-coordinate-chip" className="harness-code-inline">Coords {coordinates.label}</span> : null}
            {typedText ? <span data-id="live-monitor-text-chip" className="harness-code-inline max-w-60 truncate">{`Text: "${typedText.slice(0, 30)}${typedText.length > 30 ? '…' : ''}"`}</span> : null}
            {keyLabel ? <span data-id="live-monitor-key-chip" className="harness-code-inline">Key: {keyLabel}</span> : null}
            {scroll ? <span data-id="live-monitor-scroll-chip" className="harness-code-inline">Scroll ({scroll.x}, {scroll.y})</span> : null}
          </div>
          {step?.provider ? <span className="harness-code-inline">{step.provider}</span> : null}
        </div>
        <p className="text-sm text-[var(--steel)]">{step?.message ?? 'Select a timeline action to inspect its screenshot.'}</p>
      </div>
    </section>
  )
}

/**
 * One slot of the double-buffered stage. The incoming layer fades in over the
 * held frame via a CSS animation (keyed by artifact so retargets restart it);
 * `onShown` promotes it once the fade completes (a timeout in the hook covers
 * missed animationend events).
 */
function FrameLayer({
  slot,
  isFront,
  isIncoming,
  mode,
  onShown,
}: {
  slot: FrameSlot
  isFront: boolean
  isIncoming: boolean
  mode: 'before' | 'after'
  onShown: () => void
}) {
  if (!slot) return null
  return (
    <img
      key={slot.artifactId}
      data-id={isFront ? 'live-monitor-screenshot' : 'live-monitor-screenshot-previous'}
      className={`absolute inset-0 block h-full w-full bg-[var(--canvas)] ${isIncoming ? 'lm-frame-fade-in' : ''}`}
      style={{ zIndex: isFront ? 1 : 0 }}
      src={slot.url}
      alt={isFront ? `${mode} screenshot` : ''}
      aria-hidden={isFront ? undefined : true}
      onAnimationEnd={isIncoming ? onShown : undefined}
    />
  )
}
