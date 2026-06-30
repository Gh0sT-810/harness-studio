import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Select } from '@/components/ui/select'
import { BatchSnapshot } from '@/lib/api'
import { ArtifactMetadata, artifactApi, downloadArtifact, openArtifactInNewTab } from '@/lib/artifacts'
import { LogLevel, ParsedLogLine, filterLogLines, parseLogContent } from '@/utils/logUtils'

type Iteration = BatchSnapshot['iterations'][number]

// Render ceiling so a multi-megabyte log never mounts tens of thousands of
// rows. We keep the most recent matches (logs read newest-last) and surface a
// truncation notice; View raw / Download always expose the full file.
const MAX_RENDERED_LINES = 2000

// While the iteration is in one of these states the runner is still upserting
// the log, so the viewer polls for new lines instead of needing a manual reopen.
const LIVE_STATUSES = new Set(['executing', 'running', 'retrying'])

const LEVEL_OPTIONS = [
  { label: 'All levels', value: 'all' },
  { label: 'Debug and up', value: 'debug' },
  { label: 'Info and up', value: 'info' },
  { label: 'Warnings and up', value: 'warn' },
  { label: 'Errors only', value: 'error' },
]

// Whole-line level coloring, matching the mockup's `.logline` / `.logline.ok`
// / `.logline.warn` treatment (the timestamp column stays dimmed regardless).
const LEVEL_LINE_CLASS: Record<LogLevel, string> = {
  debug: 'text-[var(--muted)]',
  info: 'text-[var(--steel)]',
  warn: 'text-[var(--brand-warn)]',
  error: 'text-[var(--brand-error)]',
}

export function LogsViewer({ iteration, onClose }: { iteration: Iteration; onClose: () => void }) {
  const [selectedLogId, setSelectedLogId] = useState('')
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState<'all' | LogLevel>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isLive = LIVE_STATUSES.has(iteration.status)

  const filesQuery = useQuery({
    queryKey: ['iteration-log-files', iteration.id],
    queryFn: () => artifactApi.listIterationFiles(iteration.id),
  })
  const logFiles = useMemo<ArtifactMetadata[]>(
    () => (filesQuery.data ?? []).filter((file) => file.artifactType === 'log'),
    [filesQuery.data],
  )
  const activeLogId = selectedLogId || logFiles[0]?.id || ''

  const logQuery = useQuery({
    queryKey: ['iteration-log', activeLogId],
    queryFn: () => artifactApi.text(activeLogId),
    enabled: Boolean(activeLogId),
  })

  // Live updates ride the existing batch SSE stream instead of polling:
  // BatchSnapshot patches the iteration from events and passes it down, so each
  // step (which emits an `artifact.created` event and upserts the log) bumps
  // this revision and we refetch the log once — and a final time on completion.
  const liveRevision = `${iteration.artifacts?.length ?? 0}:${iteration.status}`
  const liveRevisionRef = useRef(liveRevision)
  useEffect(() => {
    if (liveRevisionRef.current === liveRevision) return
    liveRevisionRef.current = liveRevision
    if (activeLogId) void logQuery.refetch()
    else void filesQuery.refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRevision])

  const allLines = useMemo(() => parseLogContent(logQuery.data ?? ''), [logQuery.data])
  const filtered = useMemo(
    () => filterLogLines(allLines, { minLevel: level === 'all' ? null : level, query: search }),
    [allLines, level, search],
  )
  const rendered = filtered.length > MAX_RENDERED_LINES ? filtered.slice(-MAX_RENDERED_LINES) : filtered
  const hiddenCount = filtered.length - rendered.length

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [autoScroll, rendered.length])

  const activeFilename = String(logFiles.find((file) => file.id === activeLogId)?.metadata.filename ?? 'execution.log')
  const noLogs = !filesQuery.isLoading && logFiles.length === 0
  // Treat the file-list fetch as loading too, so the empty/no-match copy never
  // flashes before a log file has been resolved and fetched.
  const isLoading = filesQuery.isLoading || (Boolean(activeLogId) && logQuery.isLoading)

  return (
    <div data-id="logs-viewer" className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 shadow-2xl">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <p className="harness-kicker">Execution logs</p>
          <h3 className="harness-title">Iteration {iteration.iterationNumber}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isLive ? (
            <span data-id="logs-live-indicator" className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] px-2 py-1 text-xs font-semibold text-[var(--brand-green-deep)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--brand-green)]" aria-hidden="true" />
              Live
            </span>
          ) : null}
          <button data-id="logs-refresh" className="harness-button-secondary" type="button" onClick={() => { void filesQuery.refetch(); void logQuery.refetch() }}>
            Refresh
          </button>
          {activeLogId ? (
            <>
              <button data-id="logs-view-raw" className="harness-button-secondary" type="button" onClick={() => openArtifactInNewTab(activeLogId)}>View raw</button>
              <button data-id="logs-download" className="harness-button-secondary" type="button" onClick={() => downloadArtifact(activeLogId, activeFilename)}>Download</button>
            </>
          ) : null}
          <button data-id="logs-viewer-close" className="harness-button-secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>

      {noLogs ? (
        <div data-id="logs-viewer-empty" className="flex flex-1 items-center justify-center">
          <p className="harness-subtitle">No log artifacts captured for this iteration.</p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              data-id="logs-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search logs…"
              aria-label="Search logs"
              className="h-9 min-w-48 flex-1 rounded-md border border-[var(--hairline)] bg-[var(--canvas)] px-3 text-sm text-[var(--ink)] outline-none transition-colors focus:ring-2 focus:ring-[var(--brand-green)]"
            />
            <div className="w-44">
              <Select
                dataId="logs-level-filter"
                ariaLabel="Minimum log level"
                value={level}
                onValueChange={(value) => setLevel(value as 'all' | LogLevel)}
                options={LEVEL_OPTIONS}
                className="!h-9"
              />
            </div>
            {logFiles.length > 1 ? (
              <div className="w-56">
                <Select
                  dataId="logs-file-select"
                  ariaLabel="Log file"
                  value={activeLogId}
                  onValueChange={setSelectedLogId}
                  options={logFiles.map((file) => ({ label: String(file.metadata.filename ?? file.objectKey), value: file.id }))}
                  className="!h-9"
                />
              </div>
            ) : null}
            <button
              data-id="logs-autoscroll"
              type="button"
              aria-pressed={autoScroll}
              onClick={() => setAutoScroll((current) => !current)}
              className={autoScroll ? 'harness-button-primary !px-3 !py-1.5 text-xs' : 'harness-button-secondary !px-3 !py-1.5 text-xs'}
            >
              Auto-scroll
            </button>
          </div>

          <div data-id="logs-output" className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-3">
            {isLoading ? (
              <p data-id="logs-viewer-loading" className="harness-subtitle">Loading logs…</p>
            ) : logQuery.isError ? (
              <p data-id="logs-viewer-error" className="text-[var(--brand-error)]">Failed to load logs. Try Refresh.</p>
            ) : (
              <>
                {hiddenCount > 0 ? (
                  <p data-id="logs-truncation-notice" className="harness-log-line text-[var(--steel)]">Showing the latest {rendered.length} of {filtered.length} matching lines.</p>
                ) : null}
                {rendered.length === 0 ? (
                  <p data-id="logs-no-match" className="harness-subtitle py-3">{allLines.length === 0 ? 'Log file is empty.' : 'No lines match the current filters.'}</p>
                ) : (
                  rendered.map((line: ParsedLogLine) => (
                    <div data-id={`logs-line-${line.lineNumber}`} key={line.lineNumber} className={`harness-log-line flex gap-3 whitespace-pre-wrap break-words ${LEVEL_LINE_CLASS[line.level]}`}>
                      <span className="shrink-0 select-none whitespace-nowrap text-[var(--muted)]">{line.timestamp ?? ''}</span>
                      <span className="min-w-0 flex-1">{line.message}</span>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
