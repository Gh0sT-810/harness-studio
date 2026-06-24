import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { batchApi, gymApi, modelApi, taskApi } from '@/lib/api'

const ACTIVE_STATUSES = ['executing', 'running', 'pending', 'retrying', 'queued']

export function Batches() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('Phase 2 Batch')
  const [gymId, setGymId] = useState('')
  const [taskIds, setTaskIds] = useState<string[]>([])
  const [modelIds, setModelIds] = useState<string[]>([])
  const [iterationCount, setIterationCount] = useState(1)
  const gymsQuery = useQuery({ queryKey: ['gyms'], queryFn: gymApi.list })
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: taskApi.list })
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: modelApi.list })
  const providersQuery = useQuery({ queryKey: ['model-providers'], queryFn: modelApi.listProviders })
  const batchesQuery = useQuery({ queryKey: ['batches'], queryFn: batchApi.list })
  const gymOptions = useMemo(() => (gymsQuery.data ?? []).map((gym) => ({ label: gym.name, value: gym.id })), [gymsQuery.data])
  const tasks = useMemo(() => (tasksQuery.data ?? []).filter((task) => !gymId || task.gymId === gymId), [gymId, tasksQuery.data])
  const enabledModels = useMemo(() => {
    const providers = providersQuery.data ?? []
    const enabledProviderIds = new Set(providers.filter((provider) => provider.enabled).map((provider) => provider.id))
    return (modelsQuery.data ?? []).filter(
      (model) => model.enabled !== false && enabledProviderIds.has(model.providerId),
    )
  }, [modelsQuery.data, providersQuery.data])
  const gymName = (id: string) => (gymsQuery.data ?? []).find((gym) => gym.id === id)?.name ?? 'Unknown gym'
  const filtered = useMemo(
    () =>
      (batchesQuery.data ?? []).filter((batch) => {
        const name = (gymsQuery.data ?? []).find((gym) => gym.id === batch.gymId)?.name ?? ''
        const matchesSearch = [batch.name, batch.status, name].some((value) => value.toLowerCase().includes(search.toLowerCase()))
        if (!matchesSearch) return false
        if (statusFilter === 'all') return true
        const isActive = ACTIVE_STATUSES.includes(batch.status.toLowerCase())
        return statusFilter === 'active' ? isActive : batch.status.toLowerCase() === 'completed'
      }),
    [batchesQuery.data, gymsQuery.data, search, statusFilter],
  )
  const metrics = useMemo(() => {
    const all = batchesQuery.data ?? []
    return {
      total: all.length,
      running: all.filter((b) => ['executing', 'running'].includes(b.status.toLowerCase())).length,
      completed: all.filter((b) => b.status.toLowerCase() === 'completed').length,
      iterations: all.reduce((sum, b) => sum + (b.iterationCount ?? 0), 0),
    }
  }, [batchesQuery.data])

  const createBatch = useMutation({
    mutationFn: () => batchApi.create(gymId, taskIds, modelIds, iterationCount, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['batches'] })
      resetForm()
    },
  })

  function resetForm() {
    setShowForm(false)
    setName('Phase 2 Batch')
    setGymId('')
    setTaskIds([])
    setModelIds([])
    setIterationCount(1)
  }

  function toggle(value: string, list: string[], setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    createBatch.mutate()
  }

  return (
    <div data-id="batches-page" className="harness-page">
      <section data-id="batches-header-section" className="harness-page-header">
        <div>
          <p className="harness-kicker">Execution</p>
          <h2 className="harness-title">Batches</h2>
          <p className="harness-subtitle">Create metadata-only batches and open one-shot snapshots.</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="harness-metric"><p className="harness-metric-label">Total batches</p><p className="harness-metric-value">{metrics.total}</p></div>
        <div className="harness-metric"><p className="harness-metric-label">Running</p><p className="harness-metric-value" style={{ color: 'var(--brand-green)' }}>{metrics.running}</p></div>
        <div className="harness-metric"><p className="harness-metric-label">Completed</p><p className="harness-metric-value">{metrics.completed}</p></div>
        <div className="harness-metric"><p className="harness-metric-label">Iterations</p><p className="harness-metric-value">{metrics.iterations}</p></div>
      </section>

      <section data-id="batches-actions-section" className="harness-actions-section">
        <p data-id="batches-actions-label" className="harness-actions-label">Actions:</p>
        <div data-id="batches-status-filter" className="harness-seg">
          <button data-id="batches-filter-active" type="button" className={statusFilter === 'active' ? 'active' : ''} onClick={() => setStatusFilter('active')}>Active</button>
          <button data-id="batches-filter-all" type="button" className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>All</button>
          <button data-id="batches-filter-completed" type="button" className={statusFilter === 'completed' ? 'active' : ''} onClick={() => setStatusFilter('completed')}>Completed</button>
        </div>
        <div className="harness-actions-row">
          <input data-id="batches-search" className="harness-input min-w-64 flex-1" placeholder="Search batches" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button
            data-id="add-batch-button"
            className="shrink-0"
            type="button"
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
          >
            Create Batch
          </Button>
        </div>
      </section>

      {showForm ? (
        <Card data-id="batch-form-card" className="harness-card-padding">
          <CardHeader>
            <CardTitle>Create batch</CardTitle>
            <CardDescription>Select tasks, models, and iteration count. Execution snapshots are created on submit.</CardDescription>
          </CardHeader>
          <CardContent>
            <form data-id="batch-form" className="grid gap-4" onSubmit={handleSubmit}>
              <input data-id="batch-name-input" className="harness-input" value={name} onChange={(event) => setName(event.target.value)} />
              <Select
                dataId="batch-gym-select"
                onValueChange={(value) => {
                  setGymId(value)
                  setTaskIds([])
                }}
                options={gymOptions}
                placeholder="Select gym"
                value={gymId}
              />
              <input data-id="batch-iteration-count" className="harness-input" type="number" min={1} value={iterationCount} onChange={(event) => setIterationCount(Number(event.target.value))} />
              <div data-id="batch-task-options" className="grid gap-2">
                <p className="harness-actions-label">Tasks</p>
                {tasks.map((task) => (
                  <label data-id={`batch-task-option-${task.id}`} className="flex gap-2 text-sm" key={task.id}>
                    <input type="checkbox" checked={taskIds.includes(task.id)} onChange={() => toggle(task.id, taskIds, setTaskIds)} />
                    {task.taskId}
                  </label>
                ))}
              </div>
              <div data-id="batch-model-options" className="grid gap-2">
                <p className="harness-actions-label">Models</p>
                {enabledModels.length === 0 ? (
                  <p data-id="batch-models-empty" className="harness-subtitle">
                    No enabled models found. Create models under Admin &rarr; Model Registry for enabled providers.
                  </p>
                ) : null}
                {enabledModels.map((model) => (
                  <label data-id={`batch-model-option-${model.id}`} className="flex gap-2 text-sm" key={model.id}>
                    <input type="checkbox" checked={modelIds.includes(model.id)} onChange={() => toggle(model.id, modelIds, setModelIds)} />
                    {model.displayName}
                    {model.isDefault ? <span className="text-[var(--muted)]">(default)</span> : null}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button data-id="batch-submit" type="submit" disabled={!gymId || taskIds.length === 0 || modelIds.length === 0}>Create batch</Button>
                <Button data-id="batch-form-cancel" type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {filtered.length === 0 ? <EmptyState id="batches-empty" message="No batches found." /> : null}
      <div data-id="batches-list" className="harness-tablewrap">
        <table>
          <thead>
            <tr><th>Batch</th><th>Gym</th><th>Model</th><th>Iterations</th><th>Pass rate</th><th>Status</th><th className="text-right">Cost</th><th aria-label="actions" /></tr>
          </thead>
          <tbody>
            {filtered.map((batch) => (
              <tr data-id={`batch-card-${batch.id}`} key={batch.id}>
                <td><div className="font-semibold text-[var(--ink)]">{batch.name}</div></td>
                <td data-id={`batch-gym-${batch.id}`} className="text-[var(--steel)]">{gymName(batch.gymId)}</td>
                <td data-id={`batch-model-${batch.id}`} className="text-[var(--steel)]">{batch.models || '\u2014'}</td>
                <td className="font-mono text-[var(--steel)]">{batch.iterationCount}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--surface-soft)]">
                      <div className="h-full rounded-full bg-[var(--brand-green)]" style={{ width: `${Math.round((batch.passRate ?? 0) * 100)}%` }} />
                    </div>
                    <span data-id={`batch-passrate-${batch.id}`} className="font-mono text-[var(--steel)]">{Math.round((batch.passRate ?? 0) * 100)}%</span>
                  </div>
                </td>
                <td><StatusBadge id={`batch-status-${batch.id}`} status={batch.status} /></td>
                <td data-id={`batch-cost-${batch.id}`} className="text-right font-mono text-[var(--steel)]">${(batch.cost ?? 0).toFixed(2)}</td>
                <td>
                  <div className="flex justify-end">
                    <Button data-id={`batch-snapshot-link-${batch.id}`} variant="secondary" size="sm" asChild><Link to={`/batches/${batch.id}/runs`}>Open snapshot</Link></Button>
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
