import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { LiveMonitor } from '@/components/live-monitor/LiveMonitor'
import { LogsViewer } from '@/components/logs/LogsViewer'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { batchApi } from '@/lib/api'
import { downloadArtifact } from '@/lib/artifacts'
import { BatchEventEnvelope, useBatchEvents } from '@/lib/batch-events'
import { applyBatchEvent, createLiveBatchState, LiveBatchState } from '@/lib/live-batch-store'

const CANCELABLE_ITERATION_STATUSES = new Set(['pending', 'retrying', 'executing'])
const RUNNING_STATUSES = new Set(['executing', 'running', 'retrying'])
const FAILED_STATUSES = new Set(['failed', 'crashed', 'timeout', 'terminated', 'cancelled'])
const QUEUED_STATUSES = new Set(['pending', 'queued'])

type IterationFilter = 'all' | 'passed' | 'failed' | 'running'

const PILL_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'active' | 'secondary'> = {
  passed: 'success',
  failed: 'destructive',
  crashed: 'destructive',
  executing: 'active',
  pending: 'warning',
}

export function BatchSnapshotPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [liveState, setLiveState] = useState<LiveBatchState | null>(null)
  const [monitorIterationId, setMonitorIterationId] = useState('')
  const [logsIterationId, setLogsIterationId] = useState('')
  const [filter, setFilter] = useState<IterationFilter>('all')
  const snapshotQuery = useQuery({
    queryKey: ['batch-snapshot', id],
    queryFn: () => batchApi.snapshot(id ?? ''),
    enabled: Boolean(id),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const { data: snapshotData, refetch: refetchSnapshot } = snapshotQuery
  const createReport = useMutation({
    mutationFn: () => batchApi.createReport(id ?? ''),
    onSuccess: () => refetchSnapshot(),
  })
  const downloadReportArtifact = useMutation({
    mutationFn: ({ artifactId, name }: { artifactId: string; name: string }) => downloadArtifact(artifactId, name),
  })
  const terminateBatch = useMutation({
    mutationFn: () => batchApi.cancel(id ?? ''),
    onSuccess: () => {
      setLiveState(null)
      void refetchSnapshot()
      void queryClient.invalidateQueries({ queryKey: ['batches'] })
    },
  })

  const handleEvent = useCallback((event: BatchEventEnvelope) => {
    setLiveState((current) =>
      current ? applyBatchEvent(current, event) : snapshotData ? applyBatchEvent(createLiveBatchState(snapshotData), event) : current,
    )
  }, [snapshotData])

  const handleFallback = useCallback(() => {
    setLiveState(null)
    void refetchSnapshot()
  }, [refetchSnapshot])

  const { connectionState } = useBatchEvents(id, handleEvent, handleFallback)
  const snapshot = liveState ?? (snapshotData ? createLiveBatchState(snapshotData) : null)
  const connectionStatus = connectionState === 'live' ? 'connected' : connectionState
  const monitorIteration = snapshot?.iterations.find((iteration) => iteration.id === monitorIterationId)
  const logsIteration = snapshot?.iterations.find((iteration) => iteration.id === logsIterationId)
  const executionsById = useMemo(
    () => new Map(snapshot?.executions.map((execution) => [execution.id, execution]) ?? []),
    [snapshot],
  )
  const hasCancelableIterations = useMemo(
    () =>
      snapshot?.iterations.some((iteration) =>
        CANCELABLE_ITERATION_STATUSES.has(iteration.status) && !iteration.cancelRequested,
      ) ?? false,
    [snapshot],
  )
  const counts = snapshot?.counts ?? {}
  const total = counts.total ?? 0
  const passed = counts.passed ?? 0
  const failed = counts.failed ?? 0
  const crashed = counts.crashed ?? 0
  const running = (counts.executing ?? 0) + (counts.retrying ?? 0) + (counts.running ?? 0)
  const pending = counts.pending ?? 0
  const terminal = passed + failed + crashed + (counts.timeout ?? 0) + (counts.terminated ?? 0) + (counts.cancelled ?? 0)
  const progress = total > 0 ? Math.round((terminal / total) * 100) : 0

  const filteredIterations = useMemo(() => {
    const iterations = snapshot?.iterations ?? []
    if (filter === 'all') return iterations
    return iterations.filter((iteration) => {
      if (filter === 'passed') return iteration.status === 'passed'
      if (filter === 'failed') return FAILED_STATUSES.has(iteration.status)
      return RUNNING_STATUSES.has(iteration.status)
    })
  }, [filter, snapshot])

  const failureLog = useMemo(
    () =>
      (snapshot?.iterations ?? [])
        .filter((iteration) => FAILED_STATUSES.has(iteration.status))
        .map((iteration) => {
          const execution = executionsById.get(iteration.executionId)
          const label = execution?.snapshotTaskId || 'task'
          const reason = iteration.resultData?.error || iteration.status
          return { id: iteration.id, number: iteration.iterationNumber, text: `${label} · ${reason}` }
        }),
    [snapshot, executionsById],
  )

  if (!snapshot) {
    return <EmptyState id="snapshot-loading" message="Loading batch snapshot..." />
  }

  const primaryModel = snapshot.batch.models || 'model'
  const created = snapshot.batch.createdAt ? new Date(snapshot.batch.createdAt).toLocaleString() : ''
  const metaParts = [snapshot.batch.id, primaryModel, created ? `created ${created}` : '', 'snapshot + SSE live state'].filter(Boolean)

  return (
    <div data-id="batch-snapshot-page" className="harness-page">
      <section className="harness-page-header">
        <div className="flex items-start gap-3">
          <Button data-id="snapshot-back-to-batches" variant="ghost" size="sm" asChild>
            <Link to="/batches" aria-label="Back to batches">
              <ArrowLeft size={18} />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="harness-kicker">Batch runs</p>
            <h2 className="harness-title">{snapshot.batch.name}</h2>
            <p className="harness-subtitle truncate font-mono text-xs">{metaParts.join(' · ')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusBadge id="batch-snapshot-status" status={snapshot.batch.status} />
          <span data-id="event-connection-state" className="harness-tag">{connectionStatus === 'connected' ? 'SSE live' : connectionStatus}</span>
          <Button data-id="snapshot-reload-button" variant="secondary" size="sm" onClick={() => refetchSnapshot()}>Reload</Button>
          <Button data-id="generate-batch-report" size="sm" onClick={() => createReport.mutate()} disabled={createReport.isPending}>
            {createReport.isPending ? 'Generating...' : 'Generate report'}
          </Button>
          <Button data-id="terminate-batch-button" variant="secondary" size="sm" className="text-[var(--brand-error)]" onClick={() => terminateBatch.mutate()} disabled={!hasCancelableIterations || terminateBatch.isPending}>
            {terminateBatch.isPending ? 'Terminating...' : 'Terminate batch'}
          </Button>
        </div>
      </section>

      <section data-id="batch-overall-summary" className="grid gap-3 md:grid-cols-5">
        <SummaryCard id="snapshot-count-total" title={String(total)} description="total iterations" />
        <SummaryCard id="snapshot-count-passed" title={String(passed)} description="passed" color="var(--brand-green)" />
        <SummaryCard id="snapshot-count-failed" title={String(failed)} description="failed" color="var(--brand-error)" />
        <SummaryCard id="snapshot-count-running" title={String(running)} description="running" />
        <SummaryCard id="snapshot-progress" title={`${progress}%`} description="terminal progress" />
      </section>

      <div data-id="snapshot-progress-bar" className="harness-card-base harness-card-padding">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="harness-body-sm-medium">{terminal} / {total} iterations terminal</span>
          <span className="harness-micro">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]">
          <div className="h-full rounded-full bg-[var(--brand-green)] transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <CountPill status="passed" label="Passed" count={passed} />
          <CountPill status="failed" label="Failed" count={failed} />
          <CountPill status="crashed" label="Crashed" count={crashed} />
          <CountPill status="executing" label="Running" count={running} />
          <CountPill status="pending" label="Pending" count={pending} />
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div data-id="snapshot-iterations" className="harness-tablewrap overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hairline)] px-4 py-3">
            <span className="font-semibold text-[var(--ink)]">Iterations</span>
            <div data-id="iterations-status-filter" className="harness-seg">
              {(['all', 'passed', 'failed', 'running'] as IterationFilter[]).map((key) => (
                <button key={key} data-id={`iterations-filter-${key}`} type="button" className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
                  {key === 'all' ? 'All' : key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr><th>Task · iteration</th><th>Model</th><th>Status</th><th className="text-right">Steps</th><th className="text-right">Cost</th><th aria-label="actions" /></tr>
              </thead>
              <tbody>
                {filteredIterations.map((iteration) => {
                  const execution = executionsById.get(iteration.executionId)
                  const model = execution?.modelId ? snapshot.catalog?.models?.[execution.modelId] : undefined
                  const taskLabel = execution?.snapshotTaskId || (execution?.taskId ? snapshot.catalog?.tasks?.[execution.taskId]?.taskId : '') || 'Task'
                  const modelLabel = model?.displayName || model?.modelName || primaryModel
                  const queued = QUEUED_STATUSES.has(iteration.status)
                  return (
                    <tr data-id={`snapshot-iteration-${iteration.id}`} key={iteration.id}>
                      <td>
                        <div data-id={`snapshot-iteration-title-${iteration.id}`} className="font-semibold text-[var(--ink)]">{taskLabel} · #{iteration.iterationNumber}</div>
                        <div data-id={`snapshot-iteration-prompt-${iteration.id}`} className="max-w-md truncate font-mono text-xs text-[var(--steel)]">{execution?.snapshotPrompt ?? ''}</div>
                      </td>
                      <td data-id={`snapshot-iteration-model-${iteration.id}`} className="whitespace-nowrap text-[var(--steel)]">{modelLabel}</td>
                      <td><StatusBadge id={`snapshot-iteration-status-${iteration.id}`} status={iteration.status} /></td>
                      <td className="text-right font-mono text-[var(--steel)]">{iteration.totalSteps ? iteration.totalSteps : '—'}</td>
                      <td className="text-right font-mono text-[var(--steel)]">{queued ? '—' : `$${(iteration.cost ?? 0).toFixed(2)}`}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {queued ? (
                            <button data-id={`open-live-monitor-${iteration.id}`} type="button" className="harness-button-secondary opacity-45" disabled>Queued</button>
                          ) : (
                            <button data-id={`open-live-monitor-${iteration.id}`} type="button" className="harness-button-secondary" onClick={() => setMonitorIterationId(iteration.id)}>
                              {RUNNING_STATUSES.has(iteration.status) ? 'Live Monitor' : 'View'}
                            </button>
                          )}
                          <button
                            data-id={`open-logs-${iteration.id}`}
                            type="button"
                            className={`harness-button-secondary ${queued ? 'opacity-45' : ''}`}
                            disabled={queued}
                            onClick={() => setLogsIterationId(iteration.id)}
                          >
                            Logs
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredIterations.length === 0 ? (
                  <tr><td colSpan={6} className="harness-subtitle">No iterations match this filter.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="grid gap-4">
          <div data-id="batch-insights-tabs" className="harness-card-base harness-card-padding">
            <p className="mb-3 font-semibold text-[var(--ink)]">Report</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-[var(--steel)]">Readiness</span>
              <span data-id="report-readiness" className="harness-code-inline">{String(snapshot.report?.status ?? 'not_configured')}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button data-id="generate-batch-report-side" size="sm" onClick={() => createReport.mutate()} disabled={createReport.isPending}>
                {createReport.isPending ? 'Generating...' : 'Generate report'}
              </Button>
              <Button data-id="preview-batch-report" variant="secondary" size="sm" asChild>
                <Link to={`/reports/${snapshot.batch.id}`}>Preview report</Link>
              </Button>
              {snapshot.report?.artifactId ? (
                <Button
                  data-id="download-batch-report"
                  variant="secondary"
                  size="sm"
                  disabled={downloadReportArtifact.isPending}
                  onClick={() => {
                    if (!snapshot.report?.artifactId) return
                    downloadReportArtifact.mutate({ artifactId: snapshot.report.artifactId, name: `report-${snapshot.batch.id}.json` })
                  }}
                >
                  {downloadReportArtifact.isPending ? 'Downloading...' : 'Download'}
                </Button>
              ) : null}
            </div>
            {downloadReportArtifact.isError ? <p data-id="download-batch-report-error" className="mt-2 text-sm text-[var(--brand-error)]">Failed to download report artifact. Please try again.</p> : null}
            {snapshot.report?.error ? <p className="mt-2 text-sm text-[var(--brand-error)]">{snapshot.report.error}</p> : null}
          </div>

          <div data-id="failure-diagnostics-panel" className="harness-card-base harness-card-padding">
            <p className="mb-3 font-semibold text-[var(--ink)]">Failure diagnostics</p>
            <p className="harness-code-inline w-fit">failed={failed} · crashed={crashed} · timeout={counts.timeout ?? 0}</p>
            {failureLog.length === 0 ? (
              <p className="mt-3 harness-subtitle">No failures recorded.</p>
            ) : (
              <div data-id="iteration-error-list" className="mt-3 grid gap-1.5">
                {failureLog.map((item) => (
                  <div key={item.id} className="harness-log-line flex gap-2 text-xs">
                    <span className="shrink-0 font-mono text-[var(--steel)]">#{item.number}</span>
                    <span className="truncate text-[var(--ink)]">{item.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>
      {monitorIteration ? <LiveMonitor iteration={monitorIteration} onClose={() => setMonitorIterationId('')} /> : null}
      {logsIteration ? <LogsViewer iteration={logsIteration} onClose={() => setLogsIterationId('')} /> : null}
    </div>
  )
}

function SummaryCard({ id, title, description, color }: { id: string; title: string; description: string; color?: string }) {
  return (
    <div data-id={id} className="harness-metric">
      <p className="harness-metric-label">{description}</p>
      <p className="harness-metric-value" style={color ? { color } : undefined}>{title}</p>
    </div>
  )
}

function CountPill({ status, label, count }: { status: string; label: string; count: number }) {
  return <Badge variant={PILL_VARIANT[status] ?? 'secondary'}>{label} {count}</Badge>
}
