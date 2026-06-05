import { useEffect, useState } from 'react'
import { Activity, Boxes, Database, RadioTower, Server } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,rgb(135_168_200_/_35%),transparent_34rem),linear-gradient(135deg,rgb(245_233_216_/_65%),transparent_28rem),var(--canvas)] p-6 text-[var(--ink)] md:p-12">
      <section className="mx-auto max-w-[1180px] rounded-3xl border border-[var(--hairline)] bg-[color-mix(in_srgb,var(--canvas)_86%,transparent)] p-7 shadow-[0_24px_80px_rgb(10_10_10_/_8%)] md:p-10">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--brand-green-deep)]">
          Phase 1 Foundation
        </div>
        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <h1 className="mb-4 max-w-[780px] text-5xl font-semibold leading-[1.05] tracking-[-2px] md:text-7xl">
              Harness Studio
            </h1>
            <p className="max-w-[680px] text-lg leading-7 text-[var(--slate)]">
              A clean self-hosted harness foundation with a React shell, Go control API,
              PostgreSQL truth, and Redis readiness.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild>
                <a href={`${apiBaseUrl}/health`}>API health</a>
              </Button>
              <Button variant="secondary" asChild>
                <span>Compose ready</span>
              </Button>
            </div>
          </div>

          <StatusCard health={health} checks={checks} />
        </div>
      </section>

      <section className="mx-auto mt-4 grid max-w-[1180px] gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Phase 1 service map">
        {services.map(({ name, title, detail, Icon }) => (
          <Card className="p-5" key={name}>
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
    </main>
  )
}

function StatusCard({ health, checks }: { health: HealthStatus; checks: Record<string, string> }) {
  const badgeVariant = health === 'ok' ? 'default' : health === 'unhealthy' ? 'destructive' : 'secondary'

  return (
    <Card className="p-5" aria-label="API health">
      <div className="mb-5 flex items-center justify-between gap-4 font-bold">
        <span>Go API</span>
        <Badge variant={badgeVariant} className="font-mono">
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
      <dt className="text-[var(--muted)]">{name}</dt>
      <dd>{value}</dd>
    </div>
  )
}

const services = [
  {
    name: 'frontend',
    title: 'React + TypeScript shell',
    detail: 'Calls only the Go API through a tokenized Tailwind and shadcn-style UI.',
    Icon: Boxes,
  },
  {
    name: 'api',
    title: 'Go public/control API',
    detail: 'Owns /health and future product APIs while preserving service boundaries.',
    Icon: Server,
  },
  {
    name: 'postgres',
    title: 'PostgreSQL',
    detail: 'Durable application truth for later catalog, auth, and execution metadata.',
    Icon: Database,
  },
  {
    name: 'redis',
    title: 'Redis',
    detail: 'Broker and event readiness foundation for later execution and SSE flows.',
    Icon: RadioTower,
  },
  {
    name: 'health',
    title: 'Health checks',
    detail: 'Compose readiness uses API, frontend, Postgres, and Redis health signals.',
    Icon: Activity,
  },
].slice(0, 4)
