import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { batchApi } from '@/lib/api'

export function Reports() {
  const batchesQuery = useQuery({ queryKey: ['report-batches'], queryFn: batchApi.list })

  if (batchesQuery.isLoading) return <EmptyState id="reports-loading" message="Loading report batches..." />

  return (
    <div data-id="reports-page" className="harness-page">
      <section className="harness-page-header">
        <div>
          <p className="harness-kicker">Reports</p>
          <h2 className="harness-title">Batch reports</h2>
          <p className="harness-subtitle">Generate artifact-backed JSON, CSV, and Excel reports from completed batch runs.</p>
        </div>
      </section>
      <section className="grid gap-3">
        {(batchesQuery.data ?? []).map((batch) => (
          <Card data-id={`report-batch-${batch.id}`} className="harness-card-padding" key={batch.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{batch.name}</CardTitle>
                  <CardDescription>{batch.id}</CardDescription>
                </div>
                <StatusBadge id={`report-batch-status-${batch.id}`} status={batch.status} />
              </div>
            </CardHeader>
            <CardContent>
              <Link className="harness-button-secondary inline-flex" to={`/reports/${batch.id}`}>Open report controls</Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
