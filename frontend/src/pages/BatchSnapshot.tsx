import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { batchApi } from '@/lib/api'

export function BatchSnapshotPage() {
  const { id } = useParams()
  const snapshotQuery = useQuery({
    queryKey: ['batch-snapshot', id],
    queryFn: () => batchApi.snapshot(id ?? ''),
    enabled: Boolean(id),
    staleTime: Number.POSITIVE_INFINITY,
  })
  const snapshot = snapshotQuery.data

  if (!snapshot) {
    return <EmptyState id="snapshot-loading" message="Loading batch snapshot..." />
  }

  return (
    <div data-id="batch-snapshot-page" className="harness-page">
      <section>
        <h2 className="harness-title">{snapshot.batch.name}</h2>
        <p className="harness-subtitle">One consolidated snapshot request. No Phase 3 polling or SSE here.</p>
      </section>
      <section data-id="snapshot-counts" className="grid gap-3 md:grid-cols-4">
        {Object.entries(snapshot.counts).map(([key, value]) => (
          <Card data-id={`snapshot-count-${key}`} className="p-6" key={key}>
            <CardHeader>
              <CardTitle>{value}</CardTitle>
              <CardDescription>{key}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
      <section data-id="snapshot-executions" className="grid gap-3">
        {snapshot.executions.map((execution) => (
          <Card data-id={`snapshot-execution-${execution.id}`} className="p-6" key={execution.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{execution.snapshotPrompt}</CardTitle>
                <StatusBadge id={`snapshot-execution-status-${execution.id}`} status={execution.status} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm text-[var(--steel)]">{execution.id}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section data-id="snapshot-iterations" className="grid gap-2">
        {snapshot.iterations.map((iteration) => (
          <div data-id={`snapshot-iteration-${iteration.id}`} className="flex items-center justify-between rounded-lg border border-[var(--hairline)] p-4" key={iteration.id}>
            <span>Iteration {iteration.iterationNumber}</span>
            <StatusBadge id={`snapshot-iteration-status-${iteration.id}`} status={iteration.status} />
          </div>
        ))}
      </section>
    </div>
  )
}
