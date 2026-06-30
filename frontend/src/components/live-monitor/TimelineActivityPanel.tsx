import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye } from 'lucide-react'

import { stepDetailChips, stepHasScreenshot } from '@/components/live-monitor/step-details'
import { TimelineStep } from '@/lib/artifacts'

/**
 * The playback-synced "what the model saw and thought" panel. The detail block
 * surfaces the current step's reasoning (falling back to its message), the page
 * it saw (url + screenshot indicator), and the decoded action chips. The thread
 * below lists every step; the active row is highlighted and scrolled into view
 * as playback advances, and clicking a row drives the shared selection.
 */
export function TimelineActivityPanel({
  steps,
  selectedIndex,
  onSelect,
}: {
  steps: TimelineStep[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  const [query, setQuery] = useState('')
  const activeRowRef = useRef<HTMLButtonElement>(null)
  const current = steps[selectedIndex]
  const chips = useMemo(() => stepDetailChips(current), [current])

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const indexed = steps.map((step, index) => ({ step, index }))
    if (!normalized) return indexed
    return indexed.filter(({ step }) =>
      [step.message, step.action, step.type, step.reasoning, step.provider]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(normalized)),
    )
  }, [query, steps])

  return (
    <section data-id="live-monitor-timeline-activity" className="grid min-h-0 content-start gap-3">
      {current ? (
        <div data-id="live-monitor-activity-detail" className="grid gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
          <p className="harness-kicker">What the model thought</p>
          <p data-id="live-monitor-activity-reasoning" className="whitespace-pre-wrap break-words text-sm text-[var(--ink)]">
            {current.reasoning ?? current.response ?? current.message ?? 'No reasoning captured for this step.'}
          </p>
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-2 text-xs">
            {stepHasScreenshot(current) ? (
              <span className="inline-flex items-center gap-1 text-[var(--brand-green-deep)]">
                <Eye size={12} aria-hidden="true" /> saw screenshot
              </span>
            ) : (
              <span className="text-[var(--steel)]">No screenshot</span>
            )}
            {current.url ? <span data-id="live-monitor-activity-url" className="harness-code-inline min-w-0 max-w-full truncate">{current.url}</span> : null}
          </div>
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span key={chip.label} className="harness-code-inline">{chip.label}: {chip.value}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <input
        data-id="live-monitor-timeline-filter"
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter steps…"
        aria-label="Filter timeline steps"
        className="h-9 w-full rounded-md border border-[var(--hairline)] bg-[var(--canvas)] px-3 text-sm text-[var(--ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--brand-green)]"
      />

      {/* Step rail (mockup `.tl-item`): connected dots — filled once played,
          outlined for the current/pending steps, with the current row tinted.
          No inner scroll — the whole side panel is one scroll container (mockup
          `panel-body`), so wheel events reach the artifact sections below. */}
      <div className="px-0.5">
        {steps.length === 0 ? (
          <p data-id="live-monitor-activity-empty" className="harness-subtitle">No timeline steps captured yet.</p>
        ) : null}
        {steps.length > 0 && filtered.length === 0 ? (
          <p data-id="live-monitor-activity-no-match" className="harness-subtitle">No steps match the filter.</p>
        ) : null}
        {filtered.map(({ step, index }, position) => {
          const isCurrent = index === selectedIndex
          const isDone = index < selectedIndex
          const isLast = position === filtered.length - 1
          const detail = stepDetailChips(step)[0]?.value
          const metaParts = [detail, step.provider].filter(Boolean) as string[]
          return (
            <button
              ref={isCurrent ? activeRowRef : undefined}
              data-id={`live-monitor-activity-step-${index}`}
              key={step.id}
              type="button"
              onClick={() => onSelect(index)}
              aria-current={isCurrent}
              className={`flex w-full gap-3 rounded-md px-2 py-2 text-left transition-colors ${
                isCurrent ? 'bg-[color-mix(in_srgb,var(--brand-green)_12%,transparent)]' : 'hover:bg-[var(--surface)]'
              }`}
            >
              <span className="flex w-[18px] shrink-0 flex-col items-center" aria-hidden="true">
                <span
                  className={`mt-0.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-[var(--brand-green)] ${
                    isDone ? 'bg-[var(--brand-green)]' : 'bg-[var(--canvas)]'
                  }`}
                />
                {!isLast ? <span className="mt-1 w-0.5 flex-1 bg-[var(--hairline)]" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">{step.action ?? step.type}</span>
                <span className="block truncate font-mono text-[11.5px] text-[var(--muted)]">
                  {metaParts.join(' · ')}
                  {isCurrent ? `${metaParts.length ? ' ' : ''}◀ current` : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
