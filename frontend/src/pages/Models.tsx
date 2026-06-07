import { useQuery } from '@tanstack/react-query'

import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { modelApi } from '@/lib/api'

type ModelsProps = {
  embedded?: boolean
}

export function Models({ embedded = false }: ModelsProps) {
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: modelApi.list })
  const providersQuery = useQuery({ queryKey: ['model-providers'], queryFn: modelApi.listProviders })
  const models = modelsQuery.data ?? []
  const providers = providersQuery.data ?? []

  return (
    <div data-id="models-page" className={embedded ? 'grid gap-6' : 'harness-page'}>
      {embedded ? null : (
        <section className="harness-page-header">
          <div>
            <p className="harness-kicker">Catalog</p>
            <h2 className="harness-title">Model Registry</h2>
            <p className="harness-subtitle">Real provider and model definitions from the catalog schema.</p>
          </div>
        </section>
      )}
      <section data-id="providers-list" className="grid gap-3 md:grid-cols-2">
        {providers.map((provider) => (
          <Card data-id={`provider-card-${provider.id}`} className="harness-card-padding" key={provider.id}>
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
          <Card data-id={`model-card-${model.id}`} className="harness-card-padding" key={model.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{model.displayName}</CardTitle>
                {model.isDefault ? <Badge data-id={`model-default-${model.id}`} variant="tag">default</Badge> : null}
              </div>
              <CardDescription>{model.modelName}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="harness-code-inline w-fit">{model.id}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
