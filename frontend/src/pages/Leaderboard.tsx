import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { EmptyState } from '@/components/EmptyState'
import { Sparkline } from '@/components/charts'
import { leaderboardApi } from '@/lib/api'

export function Leaderboard() {
  const query = useQuery({ queryKey: ['leaderboard'], queryFn: leaderboardApi.list })
  const [gymFilter, setGymFilter] = useState('all')
  const allRows = useMemo(() => query.data ?? [], [query.data])
  const gymOptions = useMemo(() => Array.from(new Map(allRows.map((row) => [row.gymId, row.gymName])).entries()), [allRows])
  const rows = gymFilter === 'all' ? allRows : allRows.filter((row) => row.gymId === gymFilter)

  if (query.isLoading) return <EmptyState id="leaderboard-loading" message="Loading leaderboard..." />

  return (
    <div data-id="leaderboard-page" className="harness-page">
      <section className="harness-page-header">
        <div>
          <p className="harness-kicker">Leaderboard</p>
          <h2 className="harness-title">Model performance</h2>
          <p className="harness-subtitle">Model and gym aggregates with pass rate, timing, token, and cost metrics.</p>
        </div>
        <select
          data-id="leaderboard-gym-filter"
          className="harness-input max-w-56"
          value={gymFilter}
          onChange={(event) => setGymFilter(event.target.value)}
        >
          <option value="all">All gyms</option>
          {gymOptions.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
      </section>
      <div className="harness-tablewrap overflow-x-auto">
        <table data-id="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Model</th>
              <th>Gym</th>
              <th>Runs</th>
              <th>Pass rate</th>
              <th>Avg steps</th>
              <th>Tokens</th>
              <th>Cost</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr data-id={`leaderboard-row-${row.modelId}-${row.gymId}`} key={`${row.modelId}-${row.gymId}`}>
                <td className={`font-mono font-bold ${index === 0 ? 'text-[var(--brand-green)]' : 'text-[var(--muted)]'}`}>{index + 1}</td>
                <td className="font-semibold text-[var(--ink)]">{row.modelName}</td>
                <td className="text-[var(--steel)]">{row.gymName}</td>
                <td className="font-mono text-[var(--steel)]">{row.runs}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--surface-soft)]">
                      <div className="h-full rounded-full bg-[var(--brand-green)]" style={{ width: `${Math.round(row.passRate * 100)}%` }} />
                    </div>
                    <span className="font-mono text-[var(--ink)]">{Math.round(row.passRate * 100)}%</span>
                  </div>
                </td>
                <td className="font-mono text-[var(--steel)]">{row.averageSteps.toFixed(1)}</td>
                <td className="font-mono text-[var(--steel)]">{row.totalTokens}</td>
                <td className="font-mono text-[var(--steel)]">${row.totalCostUsd.toFixed(4)}</td>
                <td><Sparkline dataId={`leaderboard-trend-${row.modelId}-${row.gymId}`} data={row.trend ?? []} width={72} height={24} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
