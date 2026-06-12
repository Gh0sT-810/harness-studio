import { StagePoint } from '@/components/live-monitor/screen-geometry'

/**
 * OS-style mouse cursor rendered on the screenshot stage ("ditto" cursor).
 * The arrow tip sits exactly on the tracked position; transitions keep
 * playback movement smooth like a real pointer.
 */
export function CursorLayer({ point, animate = true }: { point: StagePoint | null; animate?: boolean }) {
  if (!point) return null
  return (
    <div
      data-id="live-monitor-mouse-cursor"
      className="pointer-events-none absolute z-20"
      style={{
        left: `${point.x}px`,
        top: `${point.y}px`,
        transition: animate ? 'left 180ms ease-out, top 180ms ease-out' : undefined,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brand-cursor)] opacity-20 blur-[2px]"
      />
      <svg
        data-id="live-monitor-mouse-cursor-glyph"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ display: 'block', marginLeft: '-3px', marginTop: '-3px', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.45))' }}
      >
        <path d="M3 3L10.5 20.5L13.5 13.5L20.5 10.5L3 3Z" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
      </svg>
    </div>
  )
}
