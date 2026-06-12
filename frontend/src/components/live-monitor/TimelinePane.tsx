import { TimelineStep } from '@/lib/artifacts'
import { Pause, Play, SkipBack, SkipForward, Zap } from 'lucide-react'

const SPEEDS = [0.5, 1, 1.5, 2, 3]

export function TimelinePane({
  steps,
  selectedIndex,
  isPlaying,
  speed,
  onSelect,
  onPrevious,
  onNext,
  onTogglePlay,
  onSpeedChange,
  isLive,
  followLive,
  onContinueLive,
}: {
  steps: TimelineStep[]
  selectedIndex: number
  isPlaying: boolean
  speed: number
  onSelect: (index: number) => void
  onPrevious: () => void
  onNext: () => void
  onTogglePlay: () => void
  onSpeedChange: (speed: number) => void
  isLive: boolean
  followLive: boolean
  onContinueLive: () => void
}) {
  const total = steps.length
  const selectedStep = steps[selectedIndex]
  const progress = total > 1 ? (selectedIndex / (total - 1)) * 100 : total === 1 ? 100 : 0

  return (
    <section data-id="live-monitor-timeline" className="grid min-h-0 content-start gap-3 overflow-auto">
      <div data-id="live-monitor-playback-header" className="harness-card-base grid gap-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="harness-kicker">{isLive ? 'Live Actions' : 'Playback'}</p>
            <p data-id="live-monitor-progress-label" className="text-sm font-semibold">
              {total ? `Action ${selectedIndex + 1} of ${total}` : 'No actions'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button data-id="live-monitor-prev" className="harness-button-secondary !px-2" type="button" onClick={onPrevious} disabled={selectedIndex === 0}>
              <SkipBack size={16} />
            </button>
            <button data-id="live-monitor-play" className="harness-button-primary !px-3" type="button" onClick={onTogglePlay} disabled={total === 0}>
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button data-id="live-monitor-next" className="harness-button-secondary !px-2" type="button" onClick={onNext} disabled={selectedIndex >= total - 1}>
              <SkipForward size={16} />
            </button>
          </div>
        </div>
        <div data-id="live-monitor-scrubber" className="h-2 overflow-hidden rounded-full bg-[var(--hairline-soft)]">
          <div className="h-full rounded-full bg-[var(--brand-green)] transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {SPEEDS.map((item) => (
              <button
                data-id={`live-monitor-speed-${item}`}
                className={item === speed ? 'harness-button-primary !px-2 !py-1 text-xs' : 'harness-button-secondary !px-2 !py-1 text-xs'}
                type="button"
                key={item}
                onClick={() => onSpeedChange(item)}
              >
                {item}x
              </button>
            ))}
          </div>
          {isLive && !followLive ? (
            <button data-id="live-monitor-continue-inline" className="harness-button-secondary !px-2 !py-1 text-xs" type="button" onClick={onContinueLive}>
              Continue Live
            </button>
          ) : null}
        </div>
        {selectedStep ? <p data-id="live-monitor-selected-summary" className="truncate text-xs text-[var(--steel)]">{selectedStep.message}</p> : null}
      </div>

      <div data-id="live-monitor-action-list" className="grid max-h-[520px] gap-2 overflow-auto pr-1">
        {steps.length === 0 ? <p data-id="live-monitor-empty-timeline" className="harness-subtitle">No timeline steps captured yet.</p> : null}
        {steps.map((step, index) => {
          const isSelected = index === selectedIndex
          const actionLabel = step.action ?? step.type
          const coords = coordinatesLabel(step)
          return (
            <button
              data-id={`live-monitor-step-${index}`}
              className={`harness-card-base grid gap-2 p-3 text-left transition-colors ${isSelected ? 'bg-[color-mix(in_srgb,var(--brand-green)_10%,var(--canvas))] ring-2 ring-[var(--brand-green)]' : 'hover:bg-[var(--surface)]'}`}
              type="button"
              key={step.id}
              onClick={() => onSelect(index)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{step.message}</p>
                  <p className="harness-subtitle truncate text-xs">{step.provider ? `${step.provider} · ` : ''}{actionLabel}</p>
                </div>
                <span className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-xs font-semibold text-[var(--steel)]">#{step.index}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--steel)]">
                {step.beforeArtifactId || step.afterArtifactId ? <span className="inline-flex items-center gap-1 text-[var(--brand-green-deep)]"><Zap size={12} /> screenshot</span> : <span>No screenshot</span>}
                {coords ? <span>{coords}</span> : null}
                {step.status ? <span>{step.status}</span> : null}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function coordinatesLabel(step: TimelineStep) {
  const args = step.args ?? {}
  const x = typeof args.x === 'number' ? args.x : undefined
  const y = typeof args.y === 'number' ? args.y : undefined
  if (x !== undefined && y !== undefined) return `(${x}, ${y})`
  const coordinates = args.coordinates
  if (Array.isArray(coordinates) && coordinates.length >= 2) return `(${coordinates[0]}, ${coordinates[1]})`
  return ''
}
