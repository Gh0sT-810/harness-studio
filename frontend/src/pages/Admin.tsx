import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Models } from '@/pages/Models'

const roles = ['admin', 'reviewer', 'trainer', 'auditor']
const tabs = [
  { id: 'users', label: 'Users' },
  { id: 'domains', label: 'Domains' },
  { id: 'models', label: 'Model Registry' },
] as const

type AdminTab = (typeof tabs)[number]['id']

function isAdminTab(value: string | null): value is AdminTab {
  return tabs.some((tab) => tab.id === value)
}

export function Admin() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab: AdminTab = isAdminTab(tabParam) ? tabParam : 'users'
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

  function setActiveTab(tab: AdminTab) {
    setSearchParams(tab === 'users' ? {} : { tab })
  }

  return (
    <div data-id="admin-page" className="harness-page">
      <section className="harness-page-header">
        <div>
          <p className="harness-kicker">Admin Panel</p>
          <h2 className="harness-title">Admin</h2>
          <p className="harness-subtitle">Manage users, domains, roles, and model registry settings.</p>
        </div>
      </section>

      <div data-id="admin-tabs" className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-[var(--hairline-soft)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-[var(--canvas)] text-[var(--brand-green-deep)] shadow-sm ring-1 ring-[var(--hairline)]'
                : 'text-[var(--steel)] hover:bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] hover:text-[var(--ink)]',
            )}
            data-id={`admin-tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' ? (
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
      ) : null}

      {activeTab === 'domains' ? (
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
      ) : null}

      {activeTab === 'models' ? (
        <Card data-id="admin-models-card" className="p-6">
          <CardHeader>
            <CardTitle>Model Registry</CardTitle>
            <CardDescription>Real provider and model definitions from the catalog schema.</CardDescription>
          </CardHeader>
          <CardContent>
            <Models embedded />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
