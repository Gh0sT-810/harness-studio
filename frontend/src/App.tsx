import { FormEvent, useEffect, useState } from 'react'
import { Boxes, Database, KeyRound, RadioTower, Server } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, Batch, BatchSnapshot, Gym, ModelDefinition, Task, User } from '@/lib/api'

type HealthStatus = 'checking' | 'ok' | 'unhealthy'

type HealthResponse = {
  success: boolean
  message: string
  statusCode: number
  data?: {
    status: string
    checks: Record<string, string>
  }
}

type HealthData = {
  status: string
  checks: Record<string, string>
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export function App() {
  const [health, setHealth] = useState<HealthStatus>('checking')
  const [checks, setChecks] = useState<Record<string, string>>({})
  const [email, setEmail] = useState('test@example.com')
  const [password, setPassword] = useState('Test@$1234')
  const [token, setToken] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [gyms, setGyms] = useState<Gym[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [models, setModels] = useState<ModelDefinition[]>([])
  const [batch, setBatch] = useState<Batch | null>(null)
  const [snapshot, setSnapshot] = useState<BatchSnapshot | null>(null)
  const [message, setMessage] = useState('Log in with the seeded base admin to exercise Phase 2.')

  useEffect(() => {
    const controller = new AbortController()

    async function loadHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          signal: controller.signal,
        })
        const body = (await response.json()) as HealthResponse
        const data: HealthData = body.data ?? { status: 'unhealthy', checks: {} }

        setChecks(data.checks)
        setHealth(response.ok && body.success && data.status === 'ok' ? 'ok' : 'unhealthy')
      } catch {
        if (!controller.signal.aborted) {
          setHealth('unhealthy')
        }
      }
    }

    void loadHealth()

    return () => controller.abort()
  }, [])

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    const response = await api.login(email, password)
    setToken(response.accessToken)
    setUser(response.user)
    setMessage(`Signed in as ${response.user.email}`)
    await loadCatalog(response.accessToken)
  }

  async function loadCatalog(accessToken = token) {
    if (!accessToken) return
    const [gymItems, taskItems, modelItems] = await Promise.all([
      api.listGyms(accessToken),
      api.listTasks(accessToken),
      api.listModels(accessToken),
    ])
    setGyms(gymItems)
    setTasks(taskItems)
    setModels(modelItems)
  }

  async function seedCatalog() {
    const accessToken = token
    if (!accessToken) return
    const gym = await api.createGym(accessToken, `Demo Gym ${Date.now()}`, 'https://example.com')
    await api.createTask(accessToken, gym.id, `TASK-${Date.now()}`, 'Verify that the demo workflow opens successfully.')
    await loadCatalog(accessToken)
    setMessage('Created a demo gym and task.')
  }

  async function createBatchAndSnapshot() {
    const accessToken = token
    const firstGym = gyms[0]
    const firstTask = tasks.find((task) => task.gymId === firstGym?.id)
    const firstModel = models[0]
    if (!accessToken || !firstGym || !firstTask || !firstModel) {
      setMessage('Create a gym/task first and ensure the seeded model exists.')
      return
    }
    const created = await api.createBatch(accessToken, firstGym.id, [firstTask.id], [firstModel.id])
    const snap = await api.getBatchSnapshot(accessToken, created.id)
    setBatch(created)
    setSnapshot(snap)
    setMessage('Created a batch and loaded its immutable snapshot.')
  }

  return (
    <main data-id="phase2-app" className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgb(135_168_200_/_35%),transparent_34rem),linear-gradient(135deg,rgb(245_233_216_/_65%),transparent_28rem),var(--canvas)] p-6 text-[var(--ink)] md:p-12">
      <section data-id="hero-section" className="mx-auto max-w-[1180px] rounded-3xl border border-[var(--hairline)] bg-[color-mix(in_srgb,var(--canvas)_86%,transparent)] p-7 shadow-[0_24px_80px_rgb(10_10_10_/_8%)] md:p-10">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--brand-green-deep)]">
          Phase 2 Core Model
        </div>
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <h1 className="mb-4 max-w-[780px] text-5xl font-semibold leading-[1.05] tracking-[-2px] md:text-7xl">
              Harness Studio
            </h1>
            <p className="max-w-[680px] text-lg leading-7 text-[var(--slate)]">
              Auth bootstrap, catalog metadata, batch creation, immutable execution snapshots,
              and a consolidated snapshot endpoint.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button data-id="api-health-link" asChild>
                <a href={`${apiBaseUrl}/health`}>API health</a>
              </Button>
              <Button data-id="compose-ready-indicator" variant="secondary" asChild>
                <span>Compose ready</span>
              </Button>
            </div>
          </div>

          <StatusCard health={health} checks={checks} />
        </div>
      </section>

      <section className="mx-auto mt-4 grid max-w-[1180px] gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Phase 1 service map">
        {services.map(({ name, title, detail, Icon }) => (
          <Card data-id={`service-card-${name}`} className="p-5" key={name}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--brand-green-deep)]">
                  {name}
                </div>
                <Icon className="size-4 text-[var(--muted)]" aria-hidden="true" />
              </div>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{detail}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </section>

      <section data-id="phase2-workbench" className="mx-auto mt-4 grid max-w-[1180px] gap-4 lg:grid-cols-3">
        <Card data-id="auth-card" className="p-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Base admin auth
            </CardTitle>
            <CardDescription data-id="auth-message">{message}</CardDescription>
          </CardHeader>
          <CardContent>
            <form data-id="login-form" className="grid gap-3" onSubmit={handleLogin}>
              <input data-id="login-email" className="h-10 rounded-md border border-[var(--hairline)] bg-[var(--canvas)] px-3" value={email} onChange={(event) => setEmail(event.target.value)} />
              <input data-id="login-password" className="h-10 rounded-md border border-[var(--hairline)] bg-[var(--canvas)] px-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <Button data-id="login-submit" type="submit">Log in</Button>
            </form>
            {user ? <p data-id="current-user" className="mt-3 text-sm text-[var(--steel)]">{user.email} · {user.role}</p> : null}
          </CardContent>
        </Card>

        <Card data-id="catalog-card" className="p-5">
          <CardHeader>
            <CardTitle>Catalog smoke</CardTitle>
            <CardDescription>Seed a gym and task, then reload typed catalog clients.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button data-id="seed-catalog-button" variant="secondary" onClick={seedCatalog} disabled={!token}>Create demo catalog</Button>
            <div data-id="catalog-counts" className="font-mono text-sm text-[var(--steel)]">gyms={gyms.length} tasks={tasks.length} models={models.length}</div>
          </CardContent>
        </Card>

        <Card data-id="snapshot-card" className="p-5">
          <CardHeader>
            <CardTitle>Batch snapshot</CardTitle>
            <CardDescription>Create a metadata-only batch and load one consolidated snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button data-id="create-batch-button" variant="accent" onClick={createBatchAndSnapshot} disabled={!token}>Create batch snapshot</Button>
            <div data-id="snapshot-status" className="font-mono text-sm text-[var(--steel)]">
              {snapshot ? `batch=${batch?.status ?? snapshot.batch.status} iterations=${snapshot.counts.total ?? 0}` : 'no snapshot loaded'}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

function StatusCard({ health, checks }: { health: HealthStatus; checks: Record<string, string> }) {
  const badgeVariant = health === 'ok' ? 'default' : health === 'unhealthy' ? 'destructive' : 'secondary'

  return (
    <Card data-id="api-health-card" className="p-5" aria-label="API health">
      <div className="mb-5 flex items-center justify-between gap-4 font-bold">
        <span>Go API</span>
        <Badge data-id="api-health-status" variant={badgeVariant} className="font-mono">
          {health}
        </Badge>
      </div>
      <dl className="grid gap-2">
        {Object.entries(checks).length === 0 ? (
          <StatusRow name="readiness" value="waiting for response" />
        ) : (
          Object.entries(checks).map(([name, value]) => <StatusRow key={name} name={name} value={value} />)
        )}
      </dl>
    </Card>
  )
}

function StatusRow({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-[var(--hairline)] pt-2 font-mono text-[13px]">
      <dt data-id={`health-check-${name}`} className="text-[var(--muted)]">{name}</dt>
      <dd>{value}</dd>
    </div>
  )
}

const services = [
  {
    name: 'frontend',
    title: 'Auth-aware React shell',
    detail: 'Calls only the Go API through typed clients and data-id-backed UI.',
    Icon: Boxes,
  },
  {
    name: 'api',
    title: 'Go public/control API',
    detail: 'Owns auth, catalog, batch metadata, snapshots, and RBAC.',
    Icon: Server,
  },
  {
    name: 'postgres',
    title: 'PostgreSQL',
    detail: 'Durable truth for auth, catalog, and execution schemas.',
    Icon: Database,
  },
  {
    name: 'redis',
    title: 'Redis',
    detail: 'Ready for later event backbone work in Phase 3.',
    Icon: RadioTower,
  },
].slice(0, 4)
