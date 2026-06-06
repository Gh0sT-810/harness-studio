import { useQuery } from '@tanstack/react-query'

import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { modelApi } from '@/lib/api'

export function Models() {
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: modelApi.list })
  const providersQuery = useQuery({ queryKey: ['model-providers'], queryFn: modelApi.listProviders })
  const models = modelsQuery.data ?? []
  const providers = providersQuery.data ?? []

  return (
    <div data-id="models-page" className="harness-page">
      <section>
        <h2 className="harness-title">Model Registry</h2>
        <p className="harness-subtitle">Real provider and model definitions from the catalog schema.</p>
      </section>
      <section data-id="providers-list" className="grid gap-3 md:grid-cols-2">
        {providers.map((provider) => (
          <Card data-id={`provider-card-${provider.id}`} className="p-6" key={provider.id}>
            <CardHeader>
              <CardTitle>{provider.name}</CardTitle>
              <CardDescription>{provider.adapterKey}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
      {models.length === 0 ? <EmptyState id="models-empty" message="No model definitions found." /> : null}
      <section data-id="models-list" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {models.map((model) => (
          <Card data-id={`model-card-${model.id}`} className="p-6" key={model.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{model.displayName}</CardTitle>
                {model.isDefault ? <Badge data-id={`model-default-${model.id}`}>default</Badge> : null}
              </div>
              <CardDescription>{model.modelName}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm text-[var(--steel)]">{model.id}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
