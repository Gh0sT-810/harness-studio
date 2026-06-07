import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Gym, gymApi, Task, taskApi } from '@/lib/api'

function parseJSON(value: string) {
  try {
    return value ? JSON.parse(value) as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function TaskEditForm({ gyms, gymId, task }: { gyms: Gym[]; gymId: string; task: Task }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedGymId, setSelectedGymId] = useState(task.gymId)
  const [externalTaskId, setExternalTaskId] = useState(task.taskId)
  const [prompt, setPrompt] = useState(task.prompt)
  const [graderConfig, setGraderConfig] = useState(JSON.stringify(task.graderConfig ?? {}, null, 2))
  const [simulatorConfig, setSimulatorConfig] = useState(JSON.stringify(task.simulatorConfig ?? {}, null, 2))
  const [dbJsonValidator, setDbJsonValidator] = useState(JSON.stringify(task.dbJsonValidator ?? {}, null, 2))
  const [verifierPath, setVerifierPath] = useState(task.verifierPath ?? '')
  const gymOptions = useMemo(() => gyms.map((gym) => ({ label: gym.name, value: gym.id })), [gyms])
  const selectedGym = gyms.find((gym) => gym.id === selectedGymId)

  const saveTask = useMutation({
    mutationFn: () =>
      taskApi.update(task.id, {
        gymId: selectedGymId,
        taskId: externalTaskId,
        prompt,
        graderConfig: parseJSON(graderConfig),
        simulatorConfig: parseJSON(simulatorConfig),
        dbJsonValidator: parseJSON(dbJsonValidator),
        verifierPath,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void navigate(`/gyms/${selectedGymId || gymId}/tasks`)
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    saveTask.mutate()
  }

  return (
    <Card data-id="task-form-card" className="harness-card-padding">
      <CardHeader>
        <CardTitle>Edit task</CardTitle>
        <CardDescription>Form sections adapt to the selected gym verification strategy.</CardDescription>
      </CardHeader>
      <CardContent>
        <form data-id="task-form" className="grid gap-3" onSubmit={handleSubmit}>
          <Select
            dataId="task-gym-select"
            disabled
            onValueChange={setSelectedGymId}
            options={gymOptions}
            placeholder="Select gym"
            value={selectedGymId}
          />
          <input data-id="task-id-input" className="harness-input" placeholder="Task ID" value={externalTaskId} onChange={(event) => setExternalTaskId(event.target.value)} required />
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
            <Button data-id="task-submit" type="submit">Save task</Button>
            <Button data-id="task-form-cancel" type="button" variant="secondary" asChild>
              <Link to={`/gyms/${gymId}/tasks`}>Cancel</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function TaskEdit() {
  const { gymId = '', taskId } = useParams()
  const gymsQuery = useQuery({ queryKey: ['gyms'], queryFn: gymApi.list })
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: taskApi.list })
  const gyms = useMemo(() => gymsQuery.data ?? [], [gymsQuery.data])
  const task = useMemo(
    () => (tasksQuery.data ?? []).find((candidate) => candidate.id === taskId),
    [taskId, tasksQuery.data],
  )

  if (!tasksQuery.isLoading && !task) {
    return (
      <div data-id="task-edit-page" className="harness-page">
        <EmptyState id="task-edit-empty" message="Task not found." />
      </div>
    )
  }

  return (
    <div data-id="task-edit-page" className="harness-page">
      <section data-id="task-edit-header-section" className="harness-page-header">
        <div className="flex items-start gap-3">
          <Button data-id="task-edit-back-to-tasks" variant="ghost" size="sm" asChild>
            <Link to={`/gyms/${gymId}/tasks`} aria-label="Back to tasks">
              <ArrowLeft size={18} />
            </Link>
          </Button>
          <div>
            <p className="harness-kicker">Catalog</p>
            <h2 className="harness-title">Edit Task</h2>
            <p className="harness-subtitle">Update the prompt and verification config for this task.</p>
          </div>
        </div>
      </section>

      {task ? <TaskEditForm key={task.id} gyms={gyms} gymId={gymId} task={task} /> : null}
    </div>
  )
}
