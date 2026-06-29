import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { BarMeter } from '@/components/charts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { batchApi } from '@/lib/api'
import { downloadArtifact } from '@/lib/artifacts'

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
  const downloadArtifactMutation = useMutation({
    mutationFn: ({ artifactId, name }: { artifactId: string; name: string }) => downloadArtifact(artifactId, name),
  })
  const analyticsQuery = useQuery({
    queryKey: ['batch-analytics', batchId],
    queryFn: () => batchApi.analytics(batchId),
    enabled: Boolean(batchId),
    retry: false,
  })
  const analytics = analyticsQuery.data
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
                <div className="grid gap-1">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      data-id="download-report-artifact-button"
                      variant="secondary"
                      className="w-fit"
                      disabled={downloadArtifactMutation.isPending}
                      onClick={() => {
                        if (!report.generatedArtifactId) return
                        downloadArtifactMutation.mutate({ artifactId: report.generatedArtifactId, name: `report-${report.id}.json` })
                      }}
                    >
                      {downloadArtifactMutation.isPending ? 'Downloading...' : 'Download JSON artifact'}
                    </Button>
                    {report.payload?.artifacts?.csv?.id ? (
                      <Button
                        data-id="download-report-csv-button"
                        variant="secondary"
                        className="w-fit"
                        disabled={downloadArtifactMutation.isPending}
                        onClick={() => {
                          const csvId = report.payload?.artifacts?.csv?.id
                          if (!csvId) return
                          downloadArtifactMutation.mutate({ artifactId: csvId, name: `report-${report.id}.csv` })
                        }}
                      >
                        {downloadArtifactMutation.isPending ? 'Downloading...' : 'Download CSV'}
                      </Button>
                    ) : null}
                    {report.payload?.artifacts?.xlsx?.id ? (
                      <Button
                        data-id="download-report-xlsx-button"
                        variant="secondary"
                        className="w-fit"
                        disabled={downloadArtifactMutation.isPending}
                        onClick={() => {
                          const xlsxId = report.payload?.artifacts?.xlsx?.id
                          if (!xlsxId) return
                          downloadArtifactMutation.mutate({ artifactId: xlsxId, name: `report-${report.id}.xlsx` })
                        }}
                      >
                        {downloadArtifactMutation.isPending ? 'Downloading...' : 'Download Excel report'}
                      </Button>
                    ) : null}
                  </div>
                  {downloadArtifactMutation.isError ? (
                    <p data-id="download-report-artifact-error" className="text-sm text-[var(--brand-error)]">
                      Failed to download artifact. Please try again.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="harness-subtitle">No report has been generated yet.</p>
          )}
          <Link className="harness-button-secondary inline-flex w-fit" to={`/batches/${batchId}/runs`}>Back to batch snapshot</Link>
        </CardContent>
      </Card>
      {analytics && analytics.total > 0 ? (
        <>
          <section data-id="report-analytics-metrics" className="grid gap-3 md:grid-cols-3">
            <div className="harness-metric">
              <p className="harness-metric-label">Pass rate</p>
              <p className="harness-metric-value">{Math.round(analytics.passRate * 100)}%</p>
              <p className="text-xs text-[var(--steel)]">{analytics.passed} / {analytics.total} passed</p>
            </div>
            <div className="harness-metric">
              <p className="harness-metric-label">Iterations</p>
              <p className="harness-metric-value">{analytics.total}</p>
            </div>
            <div className="harness-metric">
              <p className="harness-metric-label">Avg steps</p>
              <p className="harness-metric-value">{analytics.avgSteps.toFixed(1)}</p>
            </div>
          </section>
          {analytics.byTask.length > 0 ? (
            <section data-id="report-analytics-bytask" className="harness-tablewrap p-4">
              <p className="mb-3 font-semibold text-[var(--ink)]">Pass rate by task</p>
              <div className="grid gap-2">
                {analytics.byTask.map((task) => (
                  <div key={task.taskId} data-id={`report-task-${task.taskId}`} className="flex items-center gap-3">
                    <span className="w-48 shrink-0 truncate font-mono text-xs text-[var(--steel)]">{task.taskId}</span>
                    <BarMeter value={task.passRate} width={160} />
                    <span className="font-mono text-xs text-[var(--steel)]">{Math.round(task.passRate * 100)}%</span>
                    <span className="font-mono text-xs text-[var(--muted)]">{task.passed}/{task.total}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <div data-id="report-analytics-iterations" className="harness-tablewrap overflow-x-auto">
            <table>
              <thead>
                <tr><th>Task</th><th>Outcome</th><th className="text-right">Steps</th><th className="text-right">Tokens</th><th className="text-right">Cost</th></tr>
              </thead>
              <tbody>
                {analytics.iterations.map((iteration) => (
                  <tr data-id={`report-iteration-${iteration.id}`} key={iteration.id}>
                    <td className="font-mono text-xs text-[var(--steel)]">{iteration.taskId}</td>
                    <td><StatusBadge id={`report-iteration-status-${iteration.id}`} status={iteration.status} /></td>
                    <td className="text-right font-mono text-[var(--steel)]">{iteration.steps}</td>
                    <td className="text-right font-mono text-[var(--steel)]">{iteration.tokens.toLocaleString()}</td>
                    <td className="text-right font-mono text-[var(--steel)]">${iteration.costUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
