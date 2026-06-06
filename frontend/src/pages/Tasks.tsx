import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { gymApi, Task, taskApi } from '@/lib/api'

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
  const [editing, setEditing] = useState<Task | null>(null)
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
      return editing ? taskApi.update(editing.id, payload) : taskApi.create(payload)
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
    setEditing(null)
    setShowForm(false)
    setSelectedGymId(gymId ?? '')
    setTaskId('')
    setPrompt('')
    setGraderConfig('{}')
    setSimulatorConfig('{}')
    setDbJsonValidator('{}')
    setVerifierPath('')
  }

  function editTask(task: Task) {
    setEditing(task)
    setShowForm(true)
    setSelectedGymId(task.gymId)
    setTaskId(task.taskId)
    setPrompt(task.prompt)
    setGraderConfig(JSON.stringify(task.graderConfig ?? {}, null, 2))
    setSimulatorConfig(JSON.stringify(task.simulatorConfig ?? {}, null, 2))
    setDbJsonValidator(JSON.stringify(task.dbJsonValidator ?? {}, null, 2))
    setVerifierPath(task.verifierPath ?? '')
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    saveTask.mutate()
  }

  return (
    <div data-id="tasks-page" className="harness-page">
      <section className="harness-page-header">
        <div>
          <p className="harness-kicker">Catalog</p>
          <h2 className="harness-title">{gymId ? `${selectedGym?.name ?? 'Gym'} Tasks` : 'Tasks'}</h2>
          <p className="harness-subtitle">Create task prompts and verification configs for the catalog.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <input data-id="tasks-search" className="harness-input" placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button
            data-id="add-task-button"
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
        <Card data-id="task-form-card" className="p-6">
          <CardHeader>
            <CardTitle>{editing ? 'Edit task' : 'Add task'}</CardTitle>
            <CardDescription>Form sections adapt to the selected gym verification strategy.</CardDescription>
          </CardHeader>
          <CardContent>
            <form data-id="task-form" className="grid gap-3" onSubmit={handleSubmit}>
              <select data-id="task-gym-select" className="harness-input" value={selectedGymId || gymId || ''} onChange={(event) => setSelectedGymId(event.target.value)} required disabled={Boolean(gymId)}>
                <option value="">Select gym</option>
                {gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
              </select>
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
                <Button data-id="task-submit" type="submit">{editing ? 'Save task' : 'Create task'}</Button>
                <Button data-id="task-form-cancel" type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {filtered.length === 0 ? <EmptyState id="tasks-empty" message="No tasks found." /> : null}
      <section data-id="tasks-list" className="harness-dashboard-grid">
        {filtered.map((task) => (
          <Card data-id={`task-card-${task.id}`} className="p-6" key={task.id}>
            <CardHeader>
              <CardTitle>{task.taskId}</CardTitle>
              <CardDescription>{task.prompt}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p data-id={`task-gym-${task.id}`} className="harness-subtitle">{gyms.find((gym) => gym.id === task.gymId)?.name ?? 'Unknown gym'}</p>
              <div className="flex flex-wrap gap-2">
                <Button data-id={`task-edit-${task.id}`} variant="secondary" onClick={() => editTask(task)}>Edit</Button>
                <Button data-id={`task-delete-${task.id}`} variant="ghost" onClick={() => deleteTask.mutate(task.id)}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
