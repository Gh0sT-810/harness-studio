import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { BarSeries } from '@/components/charts'
import { EmptyState } from '@/components/EmptyState'
import { tokenStore, usageApi } from '@/lib/api'

const RANGES = { '7d': 7, '30d': 30, '90d': 90 } as const
type RangeKey = keyof typeof RANGES

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

function pctDelta(current?: number, previous?: number) {
  if (current == null || previous == null || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.5) return 'no change vs prev'
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(Math.round(pct))}% vs prev`
}

export function TokenUsage() {
  const [range, setRange] = useState<RangeKey>('30d')
  const days = RANGES[range]
  const from = isoDaysAgo(days)
  const to = isoDaysAgo(0)
  const prevFrom = isoDaysAgo(days * 2)

  const summaryQuery = useQuery({
    queryKey: ['token-usage-summary', range],
    queryFn: () => usageApi.summary({ from, to }),
    placeholderData: keepPreviousData,
  })
  const prevQuery = useQuery({
    queryKey: ['token-usage-summary-prev', range],
    queryFn: () => usageApi.summary({ from: prevFrom, to: from }),
    placeholderData: keepPreviousData,
  })
  const summary = summaryQuery.data
  const previous = prevQuery.data

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
        <div className="flex items-center gap-2">
          <div data-id="token-usage-range" className="harness-seg">
            {(Object.keys(RANGES) as RangeKey[]).map((key) => (
              <button key={key} data-id={`token-usage-range-${key}`} type="button" className={range === key ? 'active' : ''} onClick={() => setRange(key)}>{key}</button>
            ))}
          </div>
          <button data-id="token-usage-export-csv" className="harness-button-secondary" type="button" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-4">
        <Metric title={String(summary?.runs ?? 0)} description="usage records" />
        <Metric title={String(summary?.totalTokens ?? 0)} description="total tokens" delta={pctDelta(summary?.totalTokens, previous?.totalTokens)} />
        <Metric title={String(summary?.inputTokens ?? 0)} description="input tokens" />
        <Metric title={`$${(summary?.totalCostUsd ?? 0).toFixed(2)}`} description={`spend (${range})`} delta={pctDelta(summary?.totalCostUsd, previous?.totalCostUsd)} />
      </section>
      {summary?.series && summary.series.length > 0 ? (
        <section data-id="token-usage-trend" className="harness-tablewrap p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="font-semibold text-[var(--ink)]">Daily tokens</p>
            <span className="font-mono text-xs text-[var(--steel)]">{summary.series.length}d</span>
          </div>
          <BarSeries dataId="token-usage-daily-tokens" data={summary.series.map((bucket) => bucket.totalTokens)} width={640} height={88} className="w-full" />
        </section>
      ) : null}
      <section className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="By model" rows={summary?.byModel ?? []} />
        <Breakdown title="By gym" rows={summary?.byGym ?? []} />
      </section>
    </div>
  )
}

function Metric({ title, description, delta }: { title: string; description: string; delta?: string | null }) {
  return (
    <div className="harness-metric">
      <p className="harness-metric-label">{description}</p>
      <p className="harness-metric-value">{title}</p>
      {delta ? <p className="mt-1 text-xs text-[var(--steel)]">{delta}</p> : null}
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
