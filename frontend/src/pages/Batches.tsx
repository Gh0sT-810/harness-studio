import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { batchApi, gymApi, modelApi, taskApi } from '@/lib/api'

export function Batches() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('Phase 2 Batch')
  const [gymId, setGymId] = useState('')
  const [taskIds, setTaskIds] = useState<string[]>([])
  const [modelIds, setModelIds] = useState<string[]>([])
  const [iterationCount, setIterationCount] = useState(1)
  const gymsQuery = useQuery({ queryKey: ['gyms'], queryFn: gymApi.list })
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: taskApi.list })
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: modelApi.list })
  const batchesQuery = useQuery({ queryKey: ['batches'], queryFn: batchApi.list })
  const gymOptions = useMemo(() => (gymsQuery.data ?? []).map((gym) => ({ label: gym.name, value: gym.id })), [gymsQuery.data])
  const tasks = useMemo(() => (tasksQuery.data ?? []).filter((task) => !gymId || task.gymId === gymId), [gymId, tasksQuery.data])
  const filtered = useMemo(
    () =>
      (batchesQuery.data ?? []).filter((batch) => {
        const gymName = (gymsQuery.data ?? []).find((gym) => gym.id === batch.gymId)?.name ?? ''
        const query = search.toLowerCase()
        return [batch.name, batch.status, gymName].some((value) => value.toLowerCase().includes(query))
      }),
    [batchesQuery.data, gymsQuery.data, search],
  )

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

      <section data-id="batches-actions-section" className="harness-actions-section">
        <p data-id="batches-actions-label" className="harness-actions-label">Actions:</p>
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
                {(modelsQuery.data ?? []).map((model) => (
                  <label data-id={`batch-model-option-${model.id}`} className="flex gap-2 text-sm" key={model.id}>
                    <input type="checkbox" checked={modelIds.includes(model.id)} onChange={() => toggle(model.id, modelIds, setModelIds)} />
                    {model.displayName}
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
      <section data-id="batches-list" className="harness-dashboard-grid">
        {filtered.map((batch) => (
          <Card data-id={`batch-card-${batch.id}`} className="harness-card-padding" key={batch.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{batch.name}</CardTitle>
                <StatusBadge id={`batch-status-${batch.id}`} status={batch.status} />
              </div>
              <CardDescription>{batch.iterationCount} iteration(s)</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p data-id={`batch-gym-${batch.id}`} className="harness-subtitle">{(gymsQuery.data ?? []).find((gym) => gym.id === batch.gymId)?.name ?? 'Unknown gym'}</p>
              <div className="flex flex-wrap gap-2">
                <Button data-id={`batch-snapshot-link-${batch.id}`} variant="secondary" asChild><Link to={`/batches/${batch.id}/runs`}>Open snapshot</Link></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
