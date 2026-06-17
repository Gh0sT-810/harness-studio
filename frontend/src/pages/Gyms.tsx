import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Gym, gymApi } from '@/lib/api'

const verificationStrategyOptions = [
  { label: 'verification_endpoint', value: 'verification_endpoint' },
  { label: 'local_storage_assertions', value: 'local_storage_assertions' },
  { label: 'grader_config', value: 'grader_config' },
  { label: 'verifier_api_script', value: 'verifier_api_script' },
  { label: 'db_json_validator', value: 'db_json_validator' },
]

export function Gyms() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Gym | null>(null)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [description, setDescription] = useState('')
  const [strategy, setStrategy] = useState('verification_endpoint')

  const gymsQuery = useQuery({ queryKey: ['gyms'], queryFn: gymApi.list })
  const filtered = useMemo(
    () => (gymsQuery.data ?? []).filter((gym) => gym.name.toLowerCase().includes(search.toLowerCase())),
    [gymsQuery.data, search],
  )

  const saveGym = useMutation({
    mutationFn: () =>
      editing
        ? gymApi.update(editing.id, { name, baseUrl, description, verificationStrategy: strategy })
        : gymApi.create({ name, baseUrl, description, verificationStrategy: strategy }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gyms'] })
      resetForm()
    },
  })
  const deleteGym = useMutation({
    mutationFn: (id: string) => gymApi.delete(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['gyms'] }),
  })

  function resetForm() {
    setEditing(null)
    setShowForm(false)
    setName('')
    setBaseUrl('')
    setDescription('')
    setStrategy('verification_endpoint')
  }

  function editGym(gym: Gym) {
    setEditing(gym)
    setShowForm(true)
    setName(gym.name)
    setBaseUrl(gym.baseUrl)
    setDescription(gym.description ?? '')
    setStrategy(gym.verificationStrategy)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    saveGym.mutate()
  }

  return (
    <div data-id="gyms-page" className="harness-page">
      <section data-id="gyms-header-section" className="harness-page-header">
        <div>
          <p className="harness-kicker">Catalog</p>
          <h2 className="harness-title">Gyms</h2>
          <p className="harness-subtitle">Manage simulated app environments and verification strategy.</p>
        </div>
      </section>

      <section data-id="gyms-actions-section" className="harness-actions-section">
        <p data-id="gyms-actions-label" className="harness-actions-label">Actions:</p>
        <div className="harness-actions-row">
          <input data-id="gyms-search" className="harness-input min-w-64 flex-1" placeholder="Search gyms" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Button
            data-id="add-gym-button"
            className="shrink-0"
            type="button"
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
          >
            Add Gym
          </Button>
        </div>
      </section>

      {showForm ? (
        <Card data-id="gym-form-card" className="harness-card-padding">
          <CardHeader>
            <CardTitle>{editing ? 'Edit gym' : 'Create gym'}</CardTitle>
            <CardDescription>Verification strategy and similarity metadata are stored in the catalog schema.</CardDescription>
          </CardHeader>
          <CardContent>
            <form data-id="gym-form" className="grid gap-3 md:grid-cols-4" onSubmit={handleSubmit}>
              <input data-id="gym-name-input" className="harness-input" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
              <input data-id="gym-base-url-input" className="harness-input" placeholder="Base URL" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required />
              <Select dataId="gym-strategy-select" onValueChange={setStrategy} options={verificationStrategyOptions} value={strategy} />
              <div className="flex gap-2">
                <Button data-id="gym-submit" type="submit">{editing ? 'Save gym' : 'Create gym'}</Button>
                <Button data-id="gym-form-cancel" type="button" variant="secondary" onClick={resetForm}>Cancel</Button>
              </div>
              <textarea data-id="gym-description-input" className="harness-textarea min-h-20 md:col-span-4" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
            </form>
          </CardContent>
        </Card>
      ) : null}

      {filtered.length === 0 ? <EmptyState id="gyms-empty" message="No gyms found." /> : null}
      <section data-id="gyms-grid" className="harness-dashboard-grid">
        {filtered.map((gym) => (
          <div data-id={`gym-card-${gym.id}`} className="harness-tilecard" key={gym.id}>
            <div className="flex items-center justify-between gap-2">
              <span data-id={`gym-strategy-${gym.id}`} className="harness-tag">{gym.verificationStrategy}</span>
              <span data-id={`gym-task-count-${gym.id}`} className="harness-micro shrink-0">{gym.taskCount ?? 0} tasks</span>
            </div>
            <h3 className="harness-card-title mt-3">{gym.name}</h3>
            <p className="harness-subtitle mt-1 truncate">{gym.baseUrl}</p>
            <hr className="my-4 border-0 border-t border-[var(--hairline-soft)]" />
            <div className="flex flex-wrap gap-2">
              <Button data-id={`gym-tasks-link-${gym.id}`} variant="secondary" asChild><Link to={`/gyms/${gym.id}/tasks`}>Tasks</Link></Button>
              <Button data-id={`gym-open-${gym.id}`} variant="secondary" asChild><a href={gym.baseUrl} target="_blank" rel="noreferrer">Open</a></Button>
              <Button data-id={`gym-edit-${gym.id}`} variant="ghost" onClick={() => editGym(gym)}>Edit</Button>
              <Button data-id={`gym-delete-${gym.id}`} variant="ghost" onClick={() => deleteGym.mutate(gym.id)}>Delete</Button>
            </div>
          </div>
        ))}
        <button data-id="gym-new-tile" type="button" onClick={() => { resetForm(); setShowForm(true) }} className="harness-tilecard grid min-h-[8rem] place-items-center border-dashed text-[var(--muted)] transition-colors hover:text-[var(--ink)]">
          <span className="text-center">
            <span className="block text-2xl leading-none">+</span>
            <span className="mt-1 block font-semibold">New gym</span>
          </span>
        </button>
      </section>
    </div>
  )
}
