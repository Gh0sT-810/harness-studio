import { useQuery } from '@tanstack/react-query'

import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { leaderboardApi } from '@/lib/api'

export function Leaderboard() {
  const query = useQuery({ queryKey: ['leaderboard'], queryFn: leaderboardApi.list })

  if (query.isLoading) return <EmptyState id="leaderboard-loading" message="Loading leaderboard..." />

  return (
    <div data-id="leaderboard-page" className="harness-page">
      <section className="harness-page-header">
        <div>
          <p className="harness-kicker">Leaderboard</p>
          <h2 className="harness-title">Model performance</h2>
          <p className="harness-subtitle">Model and gym aggregates with pass rate, timing, token, and cost metrics.</p>
        </div>
      </section>
      <Card className="harness-card-padding">
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>{query.data?.length ?? 0} aggregate rows</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table data-id="leaderboard-table" className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--hairline-soft)]">
                <th className="py-2">Model</th>
                <th>Gym</th>
                <th>Runs</th>
                <th>Pass rate</th>
                <th>Avg steps</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {(query.data ?? []).map((row) => (
                <tr data-id={`leaderboard-row-${row.modelId}-${row.gymId}`} className="border-b border-[var(--hairline-soft)]" key={`${row.modelId}-${row.gymId}`}>
                  <td className="py-2">{row.modelName}</td>
                  <td>{row.gymName}</td>
                  <td>{row.runs}</td>
                  <td>{Math.round(row.passRate * 100)}%</td>
                  <td>{row.averageSteps.toFixed(1)}</td>
                  <td>{row.totalTokens}</td>
                  <td>${row.totalCostUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
