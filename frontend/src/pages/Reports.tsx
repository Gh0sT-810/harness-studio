import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
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
      <div className="harness-tablewrap overflow-x-auto">
        <table>
          <thead>
            <tr><th>Report</th><th>Batch ID</th><th>Status</th><th aria-label="actions" /></tr>
          </thead>
          <tbody>
            {(batchesQuery.data ?? []).map((batch) => (
              <tr data-id={`report-batch-${batch.id}`} key={batch.id}>
                <td className="font-semibold text-[var(--ink)]">{batch.name}</td>
                <td><span className="harness-code-inline">{batch.id}</span></td>
                <td><StatusBadge id={`report-batch-status-${batch.id}`} status={batch.status} /></td>
                <td>
                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" asChild>
                      <Link to={`/reports/${batch.id}`}>Open report controls</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
