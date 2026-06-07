import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { authApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Models } from '@/pages/Models'

const roles = ['admin', 'reviewer', 'trainer', 'auditor']
const roleOptions = roles.map((role) => ({ label: role, value: role }))
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

      <div data-id="admin-tabs" className="harness-segmented-tabs">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={cn('harness-segmented-tab', activeTab === tab.id ? 'shadow-[var(--shadow-subtle)]' : '')}
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
        <Card data-id="admin-users-card" className="harness-card-padding">
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Backend roles are authoritative; frontend gates are UX only.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(usersQuery.data ?? []).length === 0 ? <EmptyState id="users-empty" message="No users found." /> : null}
            {(usersQuery.data ?? []).map((user) => (
              <div data-id={`user-row-${user.id}`} className="harness-property-row flex flex-wrap items-center gap-4" key={user.id}>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
                  <p data-id={`user-name-${user.id}`} className="min-w-32 font-medium">{user.displayName}</p>
                  <p data-id={`user-email-${user.id}`} className="harness-subtitle truncate">{user.email}</p>
                </div>
                <Select
                  className="w-40 shrink-0"
                  dataId={`user-role-${user.id}`}
                  onValueChange={(role) => updateRole.mutate({ id: user.id, role })}
                  options={roleOptions}
                  value={user.role}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'domains' ? (
        <Card data-id="admin-domains-card" className="harness-card-padding">
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
              <div data-id={`domain-row-${item.id}`} className="harness-property-row flex items-center justify-between" key={item.id}>
                <span>{item.domain}</span>
                <Button data-id={`domain-delete-${item.id}`} variant="ghost" onClick={() => deleteDomain.mutate(item.id)}>Delete</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'models' ? (
        <Card data-id="admin-models-card" className="harness-card-padding">
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
