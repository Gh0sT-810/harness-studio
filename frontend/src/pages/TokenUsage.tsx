import { useQuery } from '@tanstack/react-query'

import { EmptyState } from '@/components/EmptyState'
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
    <div className="harness-metric">
      <p className="harness-metric-label">{description}</p>
      <p className="harness-metric-value">{title}</p>
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ id: string; name: string; totalTokens: number; totalCostUsd: number; runs: number }> }) {
  const totalCost = rows.reduce((sum, row) => sum + row.totalCostUsd, 0)
  return (
    <div>
      <p className="harness-card-title mb-2">{title}</p>
      <div className="harness-tablewrap overflow-x-auto">
        <table>
          <thead>
            <tr><th>Name</th><th>Runs</th><th>Tokens</th><th>Cost</th><th>Share</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-semibold text-[var(--ink)]">{row.name || row.id}</td>
                <td className="font-mono text-[var(--steel)]">{row.runs}</td>
                <td className="font-mono text-[var(--steel)]">{row.totalTokens}</td>
                <td className="font-mono text-[var(--steel)]">${row.totalCostUsd.toFixed(4)}</td>
                <td className="font-mono text-[var(--steel)]">{totalCost > 0 ? Math.round((row.totalCostUsd / totalCost) * 100) : 0}%</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="harness-subtitle">No usage records yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
