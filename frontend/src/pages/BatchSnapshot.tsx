import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { batchApi } from '@/lib/api'
import { BatchEventEnvelope, useBatchEvents } from '@/lib/batch-events'
import { applyBatchEvent, createLiveBatchState, LiveBatchState } from '@/lib/live-batch-store'

export function BatchSnapshotPage() {
  const { id } = useParams()
  const [liveState, setLiveState] = useState<LiveBatchState | null>(null)
  const snapshotQuery = useQuery({
    queryKey: ['batch-snapshot', id],
    queryFn: () => batchApi.snapshot(id ?? ''),
    enabled: Boolean(id),
    staleTime: Number.POSITIVE_INFINITY,
  })

  const handleEvent = useCallback((event: BatchEventEnvelope) => {
    setLiveState((current) =>
      current ? applyBatchEvent(current, event) : snapshotQuery.data ? applyBatchEvent(createLiveBatchState(snapshotQuery.data), event) : current,
    )
  }, [snapshotQuery.data])

  const handleFallback = useCallback(() => {
    setLiveState(null)
    void snapshotQuery.refetch()
  }, [snapshotQuery])

  const { connectionState, latestEventId } = useBatchEvents(id, handleEvent, handleFallback)
  const snapshot = liveState ?? (snapshotQuery.data ? createLiveBatchState(snapshotQuery.data) : null)
  const progress = useMemo(() => {
    if (!snapshot?.counts.total) return 0
    const terminal = (snapshot.counts.passed ?? 0) + (snapshot.counts.failed ?? 0) + (snapshot.counts.crashed ?? 0) + (snapshot.counts.timeout ?? 0) + (snapshot.counts.terminated ?? 0) + (snapshot.counts.cancelled ?? 0)
    return Math.round((terminal / snapshot.counts.total) * 100)
  }, [snapshot])

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
          <StatusBadge id="event-connection-state" status={connectionState} />
          <Button data-id="snapshot-reload-button" variant="secondary" onClick={() => snapshotQuery.refetch()}>Reload snapshot</Button>
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
            <CardContent>
              <p className="harness-code-inline w-fit">failed={snapshot.counts.failed ?? 0} crashed={snapshot.counts.crashed ?? 0} timeout={snapshot.counts.timeout ?? 0}</p>
            </CardContent>
          </Card>

          <Card data-id="batch-insights-tabs" className="harness-card-padding">
            <CardHeader>
              <CardTitle>Insights</CardTitle>
              <CardDescription>Report readiness and model/task insights will attach here in later phases.</CardDescription>
            </CardHeader>
            <CardContent>
              <p data-id="report-readiness" className="harness-code-inline w-fit">report={String(snapshot.report?.status ?? 'not_configured')}</p>
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
            {snapshot.iterations.map((iteration) => (
              <div data-id={`snapshot-iteration-${iteration.id}`} className="harness-card-base flex items-center justify-between p-4" key={iteration.id}>
                <span>Iteration {iteration.iterationNumber}</span>
                <StatusBadge id={`snapshot-iteration-status-${iteration.id}`} status={iteration.status} />
              </div>
            ))}
          </section>
        </aside>
      </section>
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
