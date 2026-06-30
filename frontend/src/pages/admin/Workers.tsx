import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { adminApi } from '@/lib/api'

const MIN_REPLICAS = 0
const MAX_REPLICAS = 200

export function Workers() {
  const queryClient = useQueryClient()
  const workersQuery = useQuery({
    queryKey: ['workers'],
    queryFn: adminApi.getWorkers,
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
  })
  const [replicas, setReplicas] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['workers'] })
  }

  const scale = useMutation({
    mutationFn: (count: number) => adminApi.scaleWorkers(count),
    onSuccess: () => {
      setMessage('Workers scaled')
      setError('')
      invalidate()
    },
    onError: () => {
      setError('Failed to scale workers')
      setMessage('')
    },
  })
  const stopIdle = useMutation({
    mutationFn: () => adminApi.stopIdleWorkers(),
    onSuccess: () => {
      setMessage('Stop-idle requested')
      setError('')
      invalidate()
    },
    onError: () => {
      setError('Failed to stop idle workers')
      setMessage('')
    },
  })
  const restart = useMutation({
    mutationFn: (id: string) => adminApi.restartWorker(id),
    onSuccess: () => {
      setMessage('Worker restart requested')
      setError('')
      invalidate()
    },
    onError: () => {
      setError('Failed to restart worker')
      setMessage('')
    },
  })

  const data = workersQuery.data
  const workers = data?.workers ?? []

  function handleScale() {
    const trimmed = replicas.trim()
    if (trimmed === '') {
      setError('Enter a worker count (use 0 for Off)')
      return
    }
    const count = Number(trimmed)
    if (!Number.isInteger(count)) {
      setError('Worker count must be a whole number')
      return
    }
    if (count < MIN_REPLICAS || count > MAX_REPLICAS) {
      setError(`Worker count must be between ${MIN_REPLICAS} and ${MAX_REPLICAS}`)
      return
    }
    setError('')
    scale.mutate(count)
  }

  return (
    <div data-id="admin-workers-panel" className="grid gap-4">
      <Card className="harness-card-padding">
        <CardHeader>
          <CardTitle>Worker Pool</CardTitle>
          <CardDescription>Live worker-execution containers. Auto-refreshes every 5s.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div data-id="workers-desired-actual" className="flex flex-wrap gap-6">
            <div className="harness-metric">
              <p className="harness-metric-label">Running</p>
              <p data-id="workers-actual" className="harness-metric-value">{data ? data.actual : '—'}</p>
            </div>
            <div className="harness-metric">
              <p className="harness-metric-label">Desired</p>
              <p data-id="workers-desired" className="harness-metric-value">{data && data.desired != null ? data.desired : '—'}</p>
            </div>
            <div className="harness-metric">
              <p className="harness-metric-label">Flower</p>
              <p className="harness-metric-value">{data ? (data.flowerAvailable ? 'connected' : 'unavailable') : '—'}</p>
            </div>
          </div>

          {workersQuery.isLoading ? (
            <EmptyState id="workers-loading" message="Loading workers..." />
          ) : workersQuery.isError ? (
            <p data-id="workers-error" className="harness-subtitle text-[var(--brand-error)]">
              Worker service unavailable.
            </p>
          ) : workers.length === 0 ? (
            <EmptyState id="workers-empty" message="No workers running." />
          ) : (
            <div className="harness-tablewrap overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>State</th>
                    <th>Activity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((worker) => (
                    <tr data-id={`worker-row-${worker.id}`} key={worker.id}>
                      <td className="font-mono text-[var(--steel)]">{worker.name || worker.id}</td>
                      <td>
                        <StatusBadge id={`worker-state-${worker.id}`} status={worker.state} />
                      </td>
                      <td>
                        <StatusBadge id={`worker-activity-${worker.id}`} status={worker.activity} />
                      </td>
                      <td>
                        <Button
                          data-id={`worker-restart-${worker.id}`}
                          variant="ghost"
                          onClick={() => restart.mutate(worker.id)}
                          disabled={restart.isPending}
                        >
                          Restart
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1">
              <span className="harness-subtitle">Worker count (0 = Off)</span>
              <input
                data-id="workers-scale-input"
                className="harness-input w-32"
                type="number"
                min={MIN_REPLICAS}
                max={MAX_REPLICAS}
                step={1}
                value={replicas}
                onChange={(event) => setReplicas(event.target.value)}
                placeholder={String(data?.actual ?? 0)}
              />
            </label>
            <Button data-id="workers-scale-save" onClick={handleScale} disabled={scale.isPending}>
              {scale.isPending ? 'Scaling...' : 'Apply'}
            </Button>
            <Button
              data-id="workers-stop-idle"
              variant="secondary"
              onClick={() => stopIdle.mutate()}
              disabled={stopIdle.isPending}
            >
              {stopIdle.isPending ? 'Stopping...' : 'Stop idle'}
            </Button>
          </div>

          {error ? (
            <p data-id="workers-scale-error" className="harness-subtitle text-[var(--brand-error)]">{error}</p>
          ) : null}
          {message ? (
            <p data-id="workers-scale-message" className="harness-subtitle">{message}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
