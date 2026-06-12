import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { LiveMonitor } from '@/components/live-monitor/LiveMonitor'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { batchApi } from '@/lib/api'
import { BatchEventEnvelope, useBatchEvents } from '@/lib/batch-events'
import { applyBatchEvent, createLiveBatchState, LiveBatchState } from '@/lib/live-batch-store'

const CANCELABLE_ITERATION_STATUSES = new Set(['pending', 'retrying', 'executing'])

export function BatchSnapshotPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [liveState, setLiveState] = useState<LiveBatchState | null>(null)
  const [monitorIterationId, setMonitorIterationId] = useState('')
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

  const { connectionState, latestEventId } = useBatchEvents(id, handleEvent, handleFallback)
  const snapshot = liveState ?? (snapshotData ? createLiveBatchState(snapshotData) : null)
  const connectionStatus = connectionState === 'live' ? 'connected' : connectionState
  const monitorIteration = snapshot?.iterations.find((iteration) => iteration.id === monitorIterationId)
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
  const progress = useMemo(() => {
    if (!snapshot?.counts.total) return 0
    const terminal = (snapshot.counts.passed ?? 0) + (snapshot.counts.failed ?? 0) + (snapshot.counts.crashed ?? 0) + (snapshot.counts.timeout ?? 0) + (snapshot.counts.terminated ?? 0) + (snapshot.counts.cancelled ?? 0)
    return Math.round((terminal / snapshot.counts.total) * 100)
  }, [snapshot])
  const failedIterationErrors = useMemo(
    () =>
      snapshot?.iterations
        .filter((iteration) => iteration.status === 'failed' && iteration.resultData?.error)
        .map((iteration) => ({ id: iteration.id, error: iteration.resultData?.error ?? '' })) ?? [],
    [snapshot],
  )

  if (!snapshot) {
    return <EmptyState id="snapshot-loading" message="Loading batch snapshot..." />
  }

  return (
    <div data-id="batch-snapshot-page" className="harness-page">
      <section className="harness-page-header">
        <div className="flex items-start gap-3">
          <Button data-id="snapshot-back-to-batches" variant="ghost" size="sm" asChild>
            <Link to="/batches" aria-label="Back to batches">
              <ArrowLeft size={18} />
            </Link>
          </Button>
          <div>
            <p className="harness-kicker">BatchRuns</p>
            <h2 className="harness-title">{snapshot.batch.name}</h2>
            <p className="harness-subtitle">Snapshot plus SSE live state. No per-row or per-card polling loops.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <StatusBadge id="event-connection-state" status={connectionStatus} />
          <StatusBadge id="batch-snapshot-status" status={snapshot.batch.status} />
          <Button data-id="snapshot-reload-button" variant="secondary" onClick={() => refetchSnapshot()}>Reload snapshot</Button>
          <Button data-id="terminate-batch-button" variant="secondary" onClick={() => terminateBatch.mutate()} disabled={!hasCancelableIterations || terminateBatch.isPending}>
            {terminateBatch.isPending ? 'Terminating...' : 'Terminate batch'}
          </Button>
        </div>
      </section>

      <section data-id="batch-overall-summary" className="grid gap-3 md:grid-cols-4">
        <SummaryCard id="snapshot-count-total" title={String(snapshot.counts.total ?? 0)} description="total iterations" />
        <SummaryCard id="snapshot-count-pending" title={String(snapshot.counts.pending ?? 0)} description="pending" />
        <SummaryCard id="snapshot-count-passed" title={String(snapshot.counts.passed ?? 0)} description="passed" />
        <SummaryCard id="snapshot-progress" title={`${progress}%`} description="terminal progress" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="grid gap-4">
          <Card data-id="failure-diagnostics-panel" className="harness-card-padding">
            <CardHeader>
              <CardTitle>Failure diagnostics</CardTitle>
              <CardDescription>Phase 3 placeholder fed by snapshot and event counts.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="harness-code-inline w-fit">failed={snapshot.counts.failed ?? 0} crashed={snapshot.counts.crashed ?? 0} timeout={snapshot.counts.timeout ?? 0}</p>
              {failedIterationErrors.length === 0 ? null : (
                <div data-id="iteration-error-list" className="grid gap-2">
                  {failedIterationErrors.map((item) => (
                    <p key={item.id} className="whitespace-pre-wrap text-sm text-[var(--danger)]">{item.error}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-id="batch-insights-tabs" className="harness-card-padding">
            <CardHeader>
              <CardTitle>Insights</CardTitle>
              <CardDescription>Report readiness, preview, and generated artifact access.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p data-id="report-readiness" className="harness-code-inline w-fit">report={String(snapshot.report?.status ?? 'not_configured')}</p>
              <div className="flex flex-wrap gap-2">
                <Button data-id="generate-batch-report" onClick={() => createReport.mutate()} disabled={createReport.isPending}>
                  {createReport.isPending ? 'Generating report...' : 'Generate report'}
                </Button>
                {snapshot.report?.reportJobId ? (
                  <Button data-id="preview-batch-report" variant="secondary" asChild>
                    <Link to={`/reports/${snapshot.batch.id}`}>Preview report</Link>
                  </Button>
                ) : null}
                {snapshot.report?.artifactId ? (
                  <Button data-id="download-batch-report" variant="secondary" asChild>
                    <a href={`/api/artifacts/${snapshot.report.artifactId}`} target="_blank" rel="noreferrer">Download report</a>
                  </Button>
                ) : null}
              </div>
              {snapshot.report?.error ? <p className="text-sm text-[var(--danger)]">{snapshot.report.error}</p> : null}
            </CardContent>
          </Card>

          <section data-id="snapshot-executions" className="grid gap-3">
            {snapshot.executions.map((execution) => (
              <Card data-id={`snapshot-execution-${execution.id}`} className="harness-card-padding" key={execution.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{execution.snapshotPrompt}</CardTitle>
                    <StatusBadge id={`snapshot-execution-status-${execution.id}`} status={execution.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="harness-code-inline w-fit">{execution.id}</p>
                </CardContent>
              </Card>
            ))}
          </section>
        </div>

        <aside className="grid gap-4">
          <Card data-id="event-stream-panel" className="overflow-hidden">
            <CardHeader>
              <CardTitle>Live events</CardTitle>
              <CardDescription>latest id: <span data-id="latest-event-id">{latestEventId || 'none'}</span></CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <div className="harness-code-block-header">
                <span>Redis stream</span>
                <button className="harness-copy-code-button" type="button">Live</button>
              </div>
              {snapshot.recentEvents.length === 0 ? <p data-id="recent-events-empty" className="harness-subtitle">No events received yet.</p> : null}
              {snapshot.recentEvents.map((event) => (
                <div data-id={`recent-event-${event.id}`} className="harness-code-block" key={event.id}>
                  <p>{event.type}</p>
                  <p className="text-[var(--on-dark-muted)]">{event.sequence}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <section data-id="snapshot-iterations" className="grid gap-2">
            {snapshot.iterations.map((iteration) => {
              const execution = executionsById.get(iteration.executionId)
              const model = execution?.modelId ? snapshot.catalog?.models?.[execution.modelId] : undefined
              const taskLabel = execution?.snapshotTaskId || (execution?.taskId ? snapshot.catalog?.tasks?.[execution.taskId]?.taskId : '') || 'Task'
              const modelLabel = model?.displayName || model?.modelName || 'Model'
              return (
                <div data-id={`snapshot-iteration-${iteration.id}`} className="harness-card-base grid gap-3 p-4" key={iteration.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p data-id={`snapshot-iteration-title-${iteration.id}`} className="font-semibold">{taskLabel} · Iteration {iteration.iterationNumber}</p>
                      <p data-id={`snapshot-iteration-model-${iteration.id}`} className="harness-subtitle">{modelLabel}</p>
                    </div>
                    <StatusBadge id={`snapshot-iteration-status-${iteration.id}`} status={iteration.status} />
                  </div>
                  <p data-id={`snapshot-iteration-prompt-${iteration.id}`} className="line-clamp-2 text-sm text-[var(--steel)]">{execution?.snapshotPrompt ?? 'No prompt snapshot available.'}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p data-id={`snapshot-iteration-execution-${iteration.id}`} className="harness-code-inline">execution={iteration.executionId}</p>
                    <button data-id={`open-live-monitor-${iteration.id}`} className="harness-button-secondary" type="button" onClick={() => setMonitorIterationId(iteration.id)}>Open Live Monitor</button>
                  </div>
                </div>
              )
            })}
          </section>
        </aside>
      </section>
      {monitorIteration ? <LiveMonitor iteration={monitorIteration} onClose={() => setMonitorIterationId('')} /> : null}
    </div>
  )
}

function SummaryCard({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <Card data-id={id} className="harness-card-padding">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
