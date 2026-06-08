import { useQuery } from '@tanstack/react-query'

import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { tokenStore, usageApi } from '@/lib/api'

export function TokenUsage() {
  const summaryQuery = useQuery({ queryKey: ['token-usage-summary'], queryFn: usageApi.summary })
  const summary = summaryQuery.data

  if (summaryQuery.isLoading) return <EmptyState id="token-usage-loading" message="Loading token usage..." />

  async function exportCsv() {
    const response = await fetch(usageApi.csvUrl(), {
      headers: { Authorization: `Bearer ${tokenStore.getAccessToken()}` },
    })
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'token_usage.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div data-id="token-usage-page" className="harness-page">
      <section className="harness-page-header">
        <div>
          <p className="harness-kicker">Token Usage</p>
          <h2 className="harness-title">Usage and cost monitoring</h2>
          <p className="harness-subtitle">Denormalized adapter usage by model and gym.</p>
        </div>
        <button
          data-id="token-usage-export-csv"
          className="harness-button-secondary"
          type="button"
          onClick={exportCsv}
        >
          Export CSV
        </button>
      </section>
      <section className="grid gap-3 md:grid-cols-4">
        <Metric title={String(summary?.runs ?? 0)} description="usage records" />
        <Metric title={String(summary?.totalTokens ?? 0)} description="total tokens" />
        <Metric title={String(summary?.inputTokens ?? 0)} description="input tokens" />
        <Metric title={`$${(summary?.totalCostUsd ?? 0).toFixed(4)}`} description="cost" />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="By model" rows={summary?.byModel ?? []} />
        <Breakdown title="By gym" rows={summary?.byGym ?? []} />
      </section>
    </div>
  )
}

function Metric({ title, description }: { title: string; description: string }) {
  return (
    <Card className="harness-card-padding">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ id: string; name: string; totalTokens: number; totalCostUsd: number; runs: number }> }) {
  return (
    <Card className="harness-card-padding">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.map((row) => (
          <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] py-2" key={row.id}>
            <span>{row.name || row.id}</span>
            <span className="harness-code-inline">{row.totalTokens} tokens / ${row.totalCostUsd.toFixed(4)}</span>
          </div>
        ))}
        {rows.length === 0 ? <p className="harness-subtitle">No usage records yet.</p> : null}
      </CardContent>
    </Card>
  )
}
