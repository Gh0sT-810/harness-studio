import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Gym, gymApi } from '@/lib/api'

export function Gyms() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
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
    setName('')
    setBaseUrl('')
    setDescription('')
    setStrategy('verification_endpoint')
  }

  function editGym(gym: Gym) {
    setEditing(gym)
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
      <section className="harness-page-header">
        <div>
          <p className="harness-kicker">Catalog</p>
          <h2 className="harness-title">Gyms</h2>
          <p className="harness-subtitle">Manage simulated app environments and verification strategy.</p>
        </div>
        <input data-id="gyms-search" className="harness-input" placeholder="Search gyms" value={search} onChange={(event) => setSearch(event.target.value)} />
      </section>

      <Card data-id="gym-form-card" className="p-6">
        <CardHeader>
          <CardTitle>{editing ? 'Edit gym' : 'Create gym'}</CardTitle>
          <CardDescription>Verification strategy and similarity metadata are stored in the catalog schema.</CardDescription>
        </CardHeader>
        <CardContent>
          <form data-id="gym-form" className="grid gap-3 md:grid-cols-4" onSubmit={handleSubmit}>
            <input data-id="gym-name-input" className="harness-input" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
            <input data-id="gym-base-url-input" className="harness-input" placeholder="Base URL" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required />
            <select data-id="gym-strategy-select" className="harness-input" value={strategy} onChange={(event) => setStrategy(event.target.value)}>
              <option value="verification_endpoint">verification_endpoint</option>
              <option value="local_storage_assertions">local_storage_assertions</option>
              <option value="grader_config">grader_config</option>
              <option value="verifier_api_script">verifier_api_script</option>
              <option value="db_json_validator">db_json_validator</option>
            </select>
            <Button data-id="gym-submit" type="submit">{editing ? 'Save gym' : 'Create gym'}</Button>
            <textarea data-id="gym-description-input" className="harness-textarea min-h-20 md:col-span-4" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </form>
        </CardContent>
      </Card>

      {filtered.length === 0 ? <EmptyState id="gyms-empty" message="No gyms found." /> : null}
      <section data-id="gyms-grid" className="harness-dashboard-grid">
        {filtered.map((gym) => (
          <Card data-id={`gym-card-${gym.id}`} className="p-6" key={gym.id}>
            <CardHeader>
              <CardTitle>{gym.name}</CardTitle>
              <CardDescription>{gym.baseUrl}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p data-id={`gym-strategy-${gym.id}`} className="font-mono text-xs text-[var(--steel)]">{gym.verificationStrategy}</p>
              <p data-id={`gym-task-count-${gym.id}`} className="harness-subtitle">{gym.taskCount ?? 0} tasks</p>
              <div className="flex flex-wrap gap-2">
                <Button data-id={`gym-tasks-link-${gym.id}`} variant="secondary" asChild><Link to={`/gyms/${gym.id}/tasks`}>Tasks</Link></Button>
                <Button data-id={`gym-open-${gym.id}`} variant="secondary" asChild><a href={gym.baseUrl} target="_blank" rel="noreferrer">Open</a></Button>
                <Button data-id={`gym-edit-${gym.id}`} variant="ghost" onClick={() => editGym(gym)}>Edit</Button>
                <Button data-id={`gym-delete-${gym.id}`} variant="ghost" onClick={() => deleteGym.mutate(gym.id)}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
