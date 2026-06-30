import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Lightweight, dependency-free disclosure used to build the Live Monitor side
 * accordion. The body is conditionally rendered (collapsed = absent from the
 * DOM) so heavy artifacts are neither fetched nor parsed until a section opens,
 * and Playwright can assert presence/absence directly.
 */
export function CollapsibleSection({
  title,
  dataId,
  defaultOpen = false,
  headerRight,
  count,
  children,
}: {
  title: string
  dataId: string
  defaultOpen?: boolean
  headerRight?: ReactNode
  count?: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    // shrink-0 so a flex-column parent never compresses the section to fit
    // (which would clip the body via overflow-hidden); the parent scrolls instead.
    <div className="harness-card-base shrink-0 overflow-hidden">
      <div className={`flex items-center justify-between gap-2 bg-[var(--surface-soft)] px-3 py-2 ${open ? 'border-b border-[var(--hairline)]' : ''}`}>
        <button
          data-id={dataId}
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-[var(--ink)]"
        >
          {open ? (
            <ChevronDown size={16} className="shrink-0 text-[var(--steel)]" aria-hidden="true" />
          ) : (
            <ChevronRight size={16} className="shrink-0 text-[var(--steel)]" aria-hidden="true" />
          )}
          <span className="truncate capitalize">{title}</span>
          {typeof count === 'number' ? <span className="harness-code-inline shrink-0">{count}</span> : null}
        </button>
        {headerRight ? <div className="flex shrink-0 items-center gap-1">{headerRight}</div> : null}
      </div>
      {open ? (
        <div data-id={`${dataId}-body`} className="p-3">
          {children}
        </div>
      ) : null}
    </div>
  )
}
