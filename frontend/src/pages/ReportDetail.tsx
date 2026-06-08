import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { batchApi } from '@/lib/api'

export function ReportDetail() {
  const { batchId = '' } = useParams()
  const queryClient = useQueryClient()
  const reportQuery = useQuery({
    queryKey: ['batch-report', batchId],
    queryFn: () => batchApi.report(batchId),
    enabled: Boolean(batchId),
    retry: false,
  })
  const createReport = useMutation({
    mutationFn: () => batchApi.createReport(batchId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch-report', batchId] }),
  })
  const report = reportQuery.data

  if (reportQuery.isLoading) return <EmptyState id="report-detail-loading" message="Loading report status..." />

  return (
    <div data-id="report-detail-page" className="harness-page">
      <section className="harness-page-header">
        <div>
          <p className="harness-kicker">Report detail</p>
          <h2 className="harness-title">Batch report</h2>
          <p className="harness-subtitle">{batchId}</p>
        </div>
        <Button data-id="generate-report-button" onClick={() => createReport.mutate()} disabled={createReport.isPending}>
          {createReport.isPending ? 'Generating...' : 'Generate report'}
        </Button>
      </section>
      <Card data-id="report-detail-card" className="harness-card-padding">
        <CardHeader>
          <CardTitle>Readiness</CardTitle>
          <CardDescription>Latest persisted report job for this batch.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {report ? (
            <>
              <StatusBadge id="report-detail-status" status={report.status} />
              <p className="harness-code-inline w-fit">report={report.id}</p>
              {report.generatedArtifactId ? (
                <a className="harness-button-secondary inline-flex w-fit" href={`/api/artifacts/${report.generatedArtifactId}`} target="_blank" rel="noreferrer">Download JSON artifact</a>
              ) : null}
            </>
          ) : (
            <p className="harness-subtitle">No report has been generated yet.</p>
          )}
          <Link className="harness-button-secondary inline-flex w-fit" to={`/batches/${batchId}/runs`}>Back to batch snapshot</Link>
        </CardContent>
      </Card>
    </div>
  )
}
