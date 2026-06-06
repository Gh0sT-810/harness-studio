import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authApi } from '@/lib/api'

const roles = ['admin', 'reviewer', 'trainer', 'auditor']

export function Admin() {
  const queryClient = useQueryClient()
  const [domain, setDomain] = useState('')
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: authApi.listUsers })
  const domainsQuery = useQuery({ queryKey: ['domains'], queryFn: authApi.listDomains })
  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => authApi.updateUserRole(id, role),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
  const createDomain = useMutation({
    mutationFn: () => authApi.createDomain(domain),
    onSuccess: () => {
      setDomain('')
      void queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
  })
  const deleteDomain = useMutation({
    mutationFn: (id: string) => authApi.deleteDomain(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['domains'] }),
  })

  function handleDomain(event: FormEvent) {
    event.preventDefault()
    createDomain.mutate()
  }

  return (
    <div data-id="admin-page" className="harness-page">
      <section>
        <h2 className="harness-title">Admin</h2>
        <p className="harness-subtitle">Manage users, roles, and allowed domains.</p>
      </section>

      <Card data-id="admin-users-card" className="p-6">
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Backend roles are authoritative; frontend gates are UX only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {(usersQuery.data ?? []).length === 0 ? <EmptyState id="users-empty" message="No users found." /> : null}
          {(usersQuery.data ?? []).map((user) => (
            <div data-id={`user-row-${user.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--hairline)] p-4" key={user.id}>
              <div>
                <p className="font-medium">{user.email}</p>
                <p className="harness-subtitle">{user.displayName}</p>
              </div>
              <select data-id={`user-role-${user.id}`} className="harness-input" value={user.role} onChange={(event) => updateRole.mutate({ id: user.id, role: event.target.value })}>
                {roles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card data-id="admin-domains-card" className="p-6">
        <CardHeader>
          <CardTitle>Domains</CardTitle>
          <CardDescription>Allowed-domain records for admin-managed auth policy.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form data-id="domain-form" className="flex flex-wrap gap-3" onSubmit={handleDomain}>
            <input data-id="domain-input" className="harness-input flex-1" placeholder="example.com" value={domain} onChange={(event) => setDomain(event.target.value)} required />
            <Button data-id="domain-submit" type="submit">Add domain</Button>
          </form>
          {(domainsQuery.data ?? []).map((item) => (
            <div data-id={`domain-row-${item.id}`} className="flex items-center justify-between rounded-lg border border-[var(--hairline)] p-4" key={item.id}>
              <span>{item.domain}</span>
              <Button data-id={`domain-delete-${item.id}`} variant="ghost" onClick={() => deleteDomain.mutate(item.id)}>Delete</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
