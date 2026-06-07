import { TimelineStep } from '@/lib/artifacts'

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
}) {
  return (
    <section data-id="live-monitor-timeline" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button data-id="live-monitor-prev" className="harness-button-secondary" type="button" onClick={onPrevious}>Previous</button>
        <button data-id="live-monitor-play" className="harness-button-primary" type="button" onClick={onTogglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
        <button data-id="live-monitor-next" className="harness-button-secondary" type="button" onClick={onNext}>Next</button>
      </div>
      <input
        data-id="live-monitor-scrubber"
        type="range"
        min={0}
        max={Math.max(steps.length - 1, 0)}
        value={selectedIndex}
        onChange={(event) => onSelect(Number(event.target.value))}
      />
      <div className="flex flex-wrap gap-2">
        {SPEEDS.map((item) => (
          <button
            data-id={`live-monitor-speed-${item}`}
            className={item === speed ? 'harness-button-primary' : 'harness-button-secondary'}
            type="button"
            key={item}
            onClick={() => onSpeedChange(item)}
          >
            {item}x
          </button>
        ))}
      </div>
      <div className="grid gap-2">
        {steps.length === 0 ? <p data-id="live-monitor-empty-timeline" className="harness-subtitle">No timeline steps captured yet.</p> : null}
        {steps.map((step, index) => (
          <button
            data-id={`live-monitor-step-${index}`}
            className={`harness-card-base p-3 text-left ${index === selectedIndex ? 'ring-2 ring-[var(--harness-primary)]' : ''}`}
            type="button"
            key={step.id}
            onClick={() => onSelect(index)}
          >
            <p className="font-semibold">{step.message}</p>
            <p className="harness-subtitle">{step.type} · {step.url ?? 'no url'}</p>
          </button>
        ))}
      </div>
    </section>
  )
}
