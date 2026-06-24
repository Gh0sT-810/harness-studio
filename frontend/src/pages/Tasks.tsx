import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { gymApi, taskApi } from '@/lib/api'

function parseJSON(value: string) {
  try {
    return value ? JSON.parse(value) as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

export function Tasks() {
  const { gymId } = useParams()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedGymId, setSelectedGymId] = useState(gymId ?? '')
  const [taskId, setTaskId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [graderConfig, setGraderConfig] = useState('{}')
  const [simulatorConfig, setSimulatorConfig] = useState('{}')
  const [dbJsonValidator, setDbJsonValidator] = useState('{}')
  const [verifierPath, setVerifierPath] = useState('')
  const gymsQuery = useQuery({ queryKey: ['gyms'], queryFn: gymApi.list })
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: taskApi.list })
  const gyms = useMemo(() => gymsQuery.data ?? [], [gymsQuery.data])
  const gymOptions = useMemo(() => gyms.map((gym) => ({ label: gym.name, value: gym.id })), [gyms])
  const selectedGym = gyms.find((gym) => gym.id === (selectedGymId || gymId))
  const tasks = useMemo(
    () => (tasksQuery.data ?? []).filter((task) => !gymId || task.gymId === gymId),
    [gymId, tasksQuery.data],
  )
  const filtered = useMemo(
    () =>
      tasks.filter((task) => {
        const gymName = gyms.find((gym) => gym.id === task.gymId)?.name ?? ''
        const query = search.toLowerCase()
        return [task.taskId, task.prompt, gymName].some((value) => value.toLowerCase().includes(query))
      }),
    [gyms, search, tasks],
  )

  const saveTask = useMutation({
    mutationFn: () => {
      const payload = {
        gymId: selectedGymId || gymId || '',
        taskId,
        prompt,
        graderConfig: parseJSON(graderConfig),
        simulatorConfig: parseJSON(simulatorConfig),
        dbJsonValidator: parseJSON(dbJsonValidator),
        verifierPath,
      }
      return taskApi.create(payload)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      resetForm()
    },
  })
  const deleteTask = useMutation({
    mutationFn: (id: string) => taskApi.delete(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  function resetForm() {
    setShowForm(false)
    setSelectedGymId(gymId ?? '')
    setTaskId('')
    setPrompt('')
    setGraderConfig('{}')
    setSimulatorConfig('{}')
    setDbJsonValidator('{}')
    setVerifierPath('')
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    saveTask.mutate()
  }

  return (
    <div data-id="tasks-page" className="harness-page">
      <section data-id="tasks-header-section" className="harness-page-header">
        <div className="flex items-start gap-3">
          {gymId ? (
            <Button data-id="tasks-back-to-gyms" variant="ghost" size="sm" asChild>
              <Link to="/gyms" aria-label="Back to gyms">
                <ArrowLeft size={18} />
              </Link>
            </Button>
          ) : null}
          <div>
            <p className="harness-kicker">Catalog</p>
            <h2 className="harness-title">{gymId ? `${selectedGym?.name ?? 'Gym'} Tasks` : 'Tasks'}</h2>
            <p className="harness-subtitle">Create task prompts and verification configs for the catalog.</p>
          </div>
        </div>
      </section>

      <section data-id="tasks-actions-section" className="harness-actions-section">
        <p data-id="tasks-actions-label" className="harness-actions-label">Actions:</p>
        <div className="harness-actions-row">
          <input data-id="tasks-search" className="harness-input min-w-64 flex-1" placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button
            data-id="add-task-button"
            className="shrink-0"
            type="button"
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
          >
            Add Task
          </Button>
        </div>
      </section>

      {showForm ? (
        <Card data-id="task-form-card" className="harness-card-padding">
          <CardHeader>
            <CardTitle>Add task</CardTitle>
            <CardDescription>Form sections adapt to the selected gym verification strategy.</CardDescription>
          </CardHeader>
          <CardContent>
            <form data-id="task-form" className="grid gap-3" onSubmit={handleSubmit}>
              <Select
                dataId="task-gym-select"
                disabled={Boolean(gymId)}
                onValueChange={setSelectedGymId}
                options={gymOptions}
                placeholder="Select gym"
                value={selectedGymId || gymId || ''}
              />
              <input data-id="task-id-input" className="harness-input" placeholder="Task ID" value={taskId} onChange={(event) => setTaskId(event.target.value)} required />
              <textarea data-id="task-prompt-input" className="harness-textarea min-h-24" placeholder="Prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} required />
              {selectedGym?.verificationStrategy === 'grader_config' ? (
                <textarea data-id="task-grader-config-input" className="harness-textarea harness-code-field min-h-24" value={graderConfig} onChange={(event) => setGraderConfig(event.target.value)} />
              ) : null}
              {selectedGym?.verificationStrategy === 'db_json_validator' ? (
                <textarea data-id="task-db-validator-input" className="harness-textarea harness-code-field min-h-24" value={dbJsonValidator} onChange={(event) => setDbJsonValidator(event.target.value)} />
              ) : null}
              {selectedGym?.verificationStrategy === 'verifier_api_script' ? (
                <input data-id="task-verifier-path-input" className="harness-input" placeholder="Verifier path" value={verifierPath} onChange={(event) => setVerifierPath(event.target.value)} />
              ) : null}
              <textarea data-id="task-simulator-config-input" className="harness-textarea harness-code-field min-h-20" value={simulatorConfig} onChange={(event) => setSimulatorConfig(event.target.value)} />
              <div className="flex gap-2">
                <Button data-id="task-submit" type="submit">Create task</Button>
                <Button data-id="task-form-cancel" type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {filtered.length === 0 ? <EmptyState id="tasks-empty" message="No tasks found." /> : null}
      <div data-id="tasks-list" className="harness-tablewrap overflow-x-auto">
        <table>
          <thead>
            <tr><th>Task</th><th>Gym</th><th>Difficulty</th><th>Pass rate</th><th>Status</th><th>Avg steps</th><th>Prompt</th><th aria-label="actions" /></tr>
          </thead>
          <tbody>
            {filtered.map((task) => (
              <tr data-id={`task-card-${task.id}`} key={task.id}>
                <td className="font-semibold text-[var(--ink)]">{task.taskId}</td>
                <td data-id={`task-gym-${task.id}`} className="whitespace-nowrap text-[var(--steel)]">{gyms.find((gym) => gym.id === task.gymId)?.name ?? 'Unknown gym'}</td>
                <td><span className="harness-tag capitalize">{task.difficulty ?? 'medium'}</span></td>
                <td>
                  {task.runs ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--surface-soft)]">
                        <div className="h-full rounded-full bg-[var(--brand-green)]" style={{ width: `${Math.round((task.passRate ?? 0) * 100)}%` }} />
                      </div>
                      <span data-id={`task-passrate-${task.id}`} className="font-mono text-[var(--steel)]">{Math.round((task.passRate ?? 0) * 100)}%</span>
                    </div>
                  ) : (
                    <span data-id={`task-passrate-${task.id}`} className="text-[var(--steel)]">—</span>
                  )}
                </td>
                <td><span data-id={`task-status-${task.id}`} className="harness-tag capitalize">{task.status ?? 'enabled'}</span></td>
                <td data-id={`task-avgsteps-${task.id}`} className="font-mono text-[var(--steel)]">{task.runs ? (task.avgSteps ?? 0).toFixed(1) : '—'}</td>
                <td className="max-w-md truncate text-[var(--steel)]">{task.prompt}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <Button data-id={`task-edit-${task.id}`} variant="secondary" size="sm" asChild>
                      <Link to={`/gyms/${task.gymId}/tasks/${task.id}/edit`}>Edit</Link>
                    </Button>
                    <Button data-id={`task-delete-${task.id}`} variant="ghost" size="sm" onClick={() => deleteTask.mutate(task.id)}>Delete</Button>
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
