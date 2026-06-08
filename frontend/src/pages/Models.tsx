import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ModelDefinition, ModelProvider, modelApi } from '@/lib/api'

type ModelsProps = {
  embedded?: boolean
}

export function Models({ embedded = false }: ModelsProps) {
  const queryClient = useQueryClient()
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: modelApi.list })
  const providersQuery = useQuery({ queryKey: ['model-providers'], queryFn: modelApi.listProviders })
  const models = modelsQuery.data ?? []
  const providers = providersQuery.data ?? []
  const [message, setMessage] = useState('')
  const [providerForm, setProviderForm] = useState({
    id: '',
    key: '',
    displayName: '',
    adapterKey: 'text_only',
    baseUrl: '',
    secretRef: '',
    configJson: '{}',
    enabled: true,
  })
  const [modelForm, setModelForm] = useState({
    id: '',
    providerId: '',
    modelName: '',
    displayName: '',
    capabilitiesJson: '{}',
    configJson: '{}',
    costConfigJson: '{}',
    timeoutSeconds: 60,
    maxOutputTokens: 0,
    enabled: true,
    isDefault: false,
  })

  function refreshRegistry() {
    void queryClient.invalidateQueries({ queryKey: ['models'] })
    void queryClient.invalidateQueries({ queryKey: ['model-providers'] })
  }

  const createProvider = useMutation({
    mutationFn: (payload: Parameters<typeof modelApi.createProvider>[0]) => modelApi.createProvider(payload),
    onSuccess: () => {
      setProviderForm({ id: '', key: '', displayName: '', adapterKey: 'text_only', baseUrl: '', secretRef: '', configJson: '{}', enabled: true })
      refreshRegistry()
    },
  })
  const updateProvider = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof modelApi.updateProvider>[1] }) => modelApi.updateProvider(id, payload),
    onSuccess: refreshRegistry,
  })
  const createModel = useMutation({
    mutationFn: (payload: Parameters<typeof modelApi.create>[0]) => modelApi.create(payload),
    onSuccess: () => {
      setModelForm({ id: '', providerId: '', modelName: '', displayName: '', capabilitiesJson: '{}', configJson: '{}', costConfigJson: '{}', timeoutSeconds: 60, maxOutputTokens: 0, enabled: true, isDefault: false })
      refreshRegistry()
    },
  })
  const updateModel = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof modelApi.update>[1] }) => modelApi.update(id, payload),
    onSuccess: refreshRegistry,
  })
  const setDefault = useMutation({
    mutationFn: modelApi.setDefault,
    onSuccess: refreshRegistry,
  })
  const testProvider = useMutation({
    mutationFn: modelApi.testProvider,
    onSuccess: (result) => setMessage(result.message),
  })
  const testModel = useMutation({
    mutationFn: modelApi.test,
    onSuccess: (result) => setMessage(result.message),
  })
  const deleteModel = useMutation({
    mutationFn: modelApi.delete,
    onSuccess: refreshRegistry,
  })

  function parseJSON(value: string, label: string) {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      throw new Error(`${label} must be valid JSON`)
    }
  }

  function submitProvider(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    try {
      const payload = {
        key: providerForm.key,
        name: providerForm.displayName,
        displayName: providerForm.displayName,
        adapterKey: providerForm.adapterKey,
        baseUrl: providerForm.baseUrl,
        secretRef: providerForm.secretRef,
        enabled: providerForm.enabled,
        config: parseJSON(providerForm.configJson, 'Provider config'),
      }
      if (providerForm.id) {
        updateProvider.mutate({ id: providerForm.id, payload })
      } else {
        createProvider.mutate(payload)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invalid provider form')
    }
  }

  function submitModel(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    try {
      const payload = {
        providerId: modelForm.providerId,
        modelName: modelForm.modelName,
        displayName: modelForm.displayName,
        capabilities: parseJSON(modelForm.capabilitiesJson, 'Capabilities'),
        config: parseJSON(modelForm.configJson, 'Model config'),
        costConfig: parseJSON(modelForm.costConfigJson, 'Cost config'),
        timeoutSeconds: modelForm.timeoutSeconds,
        maxOutputTokens: modelForm.maxOutputTokens,
        enabled: modelForm.enabled,
        isDefault: modelForm.isDefault,
      }
      if (modelForm.id) {
        updateModel.mutate({ id: modelForm.id, payload })
      } else {
        createModel.mutate(payload)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invalid model form')
    }
  }

  function editProvider(provider: ModelProvider) {
    setProviderForm({
      id: provider.id,
      key: provider.key || provider.name,
      displayName: provider.displayName || provider.name,
      adapterKey: provider.adapterKey,
      baseUrl: provider.baseUrl ?? '',
      secretRef: provider.secretRef ?? '',
      configJson: JSON.stringify(provider.config ?? {}, null, 2),
      enabled: provider.enabled,
    })
  }

  function editModel(model: ModelDefinition) {
    setModelForm({
      id: model.id,
      providerId: model.providerId,
      modelName: model.modelName,
      displayName: model.displayName,
      capabilitiesJson: JSON.stringify(model.capabilities ?? {}, null, 2),
      configJson: JSON.stringify(model.config ?? {}, null, 2),
      costConfigJson: JSON.stringify(model.costConfig ?? {}, null, 2),
      timeoutSeconds: model.timeoutSeconds ?? 60,
      maxOutputTokens: model.maxOutputTokens ?? 0,
      enabled: model.enabled ?? true,
      isDefault: model.isDefault,
    })
  }

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
      {embedded ? (
        <section data-id="model-registry-admin-forms" className="grid gap-4 xl:grid-cols-2">
          <Card className="harness-card-padding">
            <CardHeader>
              <CardTitle>{providerForm.id ? 'Edit Provider' : 'Create Provider'}</CardTitle>
              <CardDescription>Use secret references, not raw API keys.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={submitProvider}>
                <input data-id="provider-key-input" className="harness-input" placeholder="provider key" value={providerForm.key} onChange={(event) => setProviderForm({ ...providerForm, key: event.target.value })} required />
                <input data-id="provider-name-input" className="harness-input" placeholder="display name" value={providerForm.displayName} onChange={(event) => setProviderForm({ ...providerForm, displayName: event.target.value })} required />
                <input data-id="provider-adapter-input" className="harness-input" placeholder="adapter key" value={providerForm.adapterKey} onChange={(event) => setProviderForm({ ...providerForm, adapterKey: event.target.value })} required />
                <input data-id="provider-base-url-input" className="harness-input" placeholder="base URL" value={providerForm.baseUrl} onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })} />
                <input data-id="provider-secret-ref-input" className="harness-input" placeholder="secret ref, e.g. OPENAI_API_KEY" value={providerForm.secretRef} onChange={(event) => setProviderForm({ ...providerForm, secretRef: event.target.value })} />
                <textarea data-id="provider-config-input" className="harness-input min-h-24 font-mono text-xs" value={providerForm.configJson} onChange={(event) => setProviderForm({ ...providerForm, configJson: event.target.value })} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={providerForm.enabled} onChange={(event) => setProviderForm({ ...providerForm, enabled: event.target.checked })} /> Enabled</label>
                <Button data-id="provider-submit" type="submit">{providerForm.id ? 'Update provider' : 'Create provider'}</Button>
              </form>
            </CardContent>
          </Card>
          <Card className="harness-card-padding">
            <CardHeader>
              <CardTitle>{modelForm.id ? 'Edit Model' : 'Create Model'}</CardTitle>
              <CardDescription>Capabilities, cost config, and adapter config are JSON.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={submitModel}>
                <select data-id="model-provider-input" className="harness-input" value={modelForm.providerId} onChange={(event) => setModelForm({ ...modelForm, providerId: event.target.value })} required>
                  <option value="">Select provider</option>
                  {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName || provider.name}</option>)}
                </select>
                <input data-id="model-name-input" className="harness-input" placeholder="model name" value={modelForm.modelName} onChange={(event) => setModelForm({ ...modelForm, modelName: event.target.value })} required />
                <input data-id="model-display-input" className="harness-input" placeholder="display name" value={modelForm.displayName} onChange={(event) => setModelForm({ ...modelForm, displayName: event.target.value })} required />
                <textarea data-id="model-capabilities-input" className="harness-input min-h-20 font-mono text-xs" value={modelForm.capabilitiesJson} onChange={(event) => setModelForm({ ...modelForm, capabilitiesJson: event.target.value })} />
                <textarea data-id="model-config-input" className="harness-input min-h-20 font-mono text-xs" value={modelForm.configJson} onChange={(event) => setModelForm({ ...modelForm, configJson: event.target.value })} />
                <textarea data-id="model-cost-input" className="harness-input min-h-20 font-mono text-xs" value={modelForm.costConfigJson} onChange={(event) => setModelForm({ ...modelForm, costConfigJson: event.target.value })} />
                <input data-id="model-timeout-input" className="harness-input" type="number" min={1} value={modelForm.timeoutSeconds} onChange={(event) => setModelForm({ ...modelForm, timeoutSeconds: Number(event.target.value) })} />
                <input data-id="model-max-output-input" className="harness-input" type="number" min={0} value={modelForm.maxOutputTokens} onChange={(event) => setModelForm({ ...modelForm, maxOutputTokens: Number(event.target.value) })} />
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={modelForm.enabled} onChange={(event) => setModelForm({ ...modelForm, enabled: event.target.checked })} /> Enabled</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={modelForm.isDefault} onChange={(event) => setModelForm({ ...modelForm, isDefault: event.target.checked })} /> Default</label>
                </div>
                <Button data-id="model-submit" type="submit">{modelForm.id ? 'Update model' : 'Create model'}</Button>
              </form>
            </CardContent>
          </Card>
        </section>
      ) : null}
      {message ? <p data-id="model-registry-message" className="harness-subtitle">{message}</p> : null}
      <section data-id="providers-list" className="grid gap-3 md:grid-cols-2">
        {providers.map((provider) => (
          <Card data-id={`provider-card-${provider.id}`} className="harness-card-padding" key={provider.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{provider.displayName || provider.name}</CardTitle>
                <Badge variant={provider.enabled ? 'tag' : 'secondary'}>{provider.enabled ? 'enabled' : 'disabled'}</Badge>
              </div>
              <CardDescription>{provider.adapterKey}</CardDescription>
            </CardHeader>
            {embedded ? (
              <CardContent className="flex flex-wrap gap-2">
                <Button data-id={`provider-edit-${provider.id}`} variant="secondary" onClick={() => editProvider(provider)}>Edit</Button>
                <Button data-id={`provider-test-${provider.id}`} variant="secondary" onClick={() => testProvider.mutate(provider.id)}>Test</Button>
                <Button data-id={`provider-disable-${provider.id}`} variant="ghost" onClick={() => updateProvider.mutate({ id: provider.id, payload: { ...provider, displayName: provider.displayName || provider.name, enabled: !provider.enabled } })}>{provider.enabled ? 'Disable' : 'Enable'}</Button>
              </CardContent>
            ) : null}
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
              {embedded ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button data-id={`model-edit-${model.id}`} variant="secondary" onClick={() => editModel(model)}>Edit</Button>
                  <Button data-id={`model-default-action-${model.id}`} variant="secondary" onClick={() => setDefault.mutate(model.id)}>Set default</Button>
                  <Button data-id={`model-test-${model.id}`} variant="secondary" onClick={() => testModel.mutate(model.id)}>Test</Button>
                  <Button data-id={`model-delete-${model.id}`} variant="ghost" onClick={() => deleteModel.mutate(model.id)}>Disable</Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
