import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ModelDefinition, ModelProvider, modelApi } from '@/lib/api'

type ModelsProps = {
  embedded?: boolean
}

const defaultProviderForm = {
  id: '',
  key: '',
  displayName: '',
  adapterKey: 'text_only',
  baseUrl: '',
  secretRef: '',
  configJson: '{}',
  enabled: true,
}

const defaultModelForm = {
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
}

type ModelPreset = {
  modelName: string
  displayName: string
  config: Record<string, unknown>
  help: string
}

const modelPresets: Record<string, ModelPreset> = {
  openai_responses_computer: {
    modelName: 'computer-use-preview',
    displayName: 'OpenAI Computer Use Preview',
    config: {
      toolMode: 'computer_use_preview',
      requiredTool: 'computer_use_preview',
      modelFamily: 'openai_computer_preview',
    },
    help: 'OpenAI computer-use preview currently requires modelName computer-use-preview. Do not use text models like gpt-4.1 for this adapter.',
  },
  text_only: {
    modelName: 'gpt-4.1',
    displayName: 'GPT 4.1',
    config: { modelFamily: 'openai_text' },
    help: 'Text models such as gpt-4.1 are suitable for text-only runs, not browser-control computer use.',
  },
  anthropic_computer_use: {
    modelName: 'claude-sonnet-4',
    displayName: 'Claude Sonnet Computer Use',
    config: { modelFamily: 'anthropic_computer_use' },
    help: 'Use an Anthropic model that supports the configured computer-use tool contract.',
  },
  gemini_computer_use: {
    modelName: 'gemini-2.5-computer-use-preview',
    displayName: 'Gemini Computer Use Preview',
    config: { modelFamily: 'gemini_computer_use' },
    help: 'Use a Gemini model that supports computer-use actions.',
  },
}

export function Models({ embedded = false }: ModelsProps) {
  const queryClient = useQueryClient()
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: modelApi.list })
  const providersQuery = useQuery({ queryKey: ['model-providers'], queryFn: modelApi.listProviders })
  const models = modelsQuery.data ?? []
  const providers = providersQuery.data ?? []
  const [message, setMessage] = useState('')
  const [providerModalOpen, setProviderModalOpen] = useState(false)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [providerForm, setProviderForm] = useState(defaultProviderForm)
  const [modelForm, setModelForm] = useState(defaultModelForm)
  const selectedModelProvider = providers.find((provider) => provider.id === modelForm.providerId)
  const selectedModelPreset = selectedModelProvider ? modelPresets[selectedModelProvider.adapterKey] : undefined
  const openAIComputerUseMismatch = selectedModelProvider?.adapterKey === 'openai_responses_computer' && modelForm.modelName !== 'computer-use-preview'

  function refreshRegistry() {
    void queryClient.invalidateQueries({ queryKey: ['models'] })
    void queryClient.invalidateQueries({ queryKey: ['model-providers'] })
  }

  function resetProviderForm() {
    setProviderForm(defaultProviderForm)
  }

  function resetModelForm() {
    setModelForm(defaultModelForm)
  }

  function openCreateProviderModal() {
    resetProviderForm()
    setProviderModalOpen(true)
  }

  function openCreateModelModal() {
    resetModelForm()
    setModelModalOpen(true)
  }

  function handleModelProviderChange(providerId: string) {
    const provider = providers.find((item) => item.id === providerId)
    const preset = provider ? modelPresets[provider.adapterKey] : undefined
    setModelForm({
      ...modelForm,
      providerId,
      modelName: preset?.modelName ?? '',
      displayName: preset?.displayName ?? '',
      configJson: JSON.stringify(preset?.config ?? {}, null, 2),
    })
  }

  const createProvider = useMutation({
    mutationFn: (payload: Parameters<typeof modelApi.createProvider>[0]) => modelApi.createProvider(payload),
    onSuccess: () => {
      resetProviderForm()
      setProviderModalOpen(false)
      refreshRegistry()
    },
  })
  const updateProvider = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof modelApi.updateProvider>[1] }) => modelApi.updateProvider(id, payload),
    onSuccess: () => {
      resetProviderForm()
      setProviderModalOpen(false)
      refreshRegistry()
    },
  })
  const createModel = useMutation({
    mutationFn: (payload: Parameters<typeof modelApi.create>[0]) => modelApi.create(payload),
    onSuccess: () => {
      resetModelForm()
      setModelModalOpen(false)
      refreshRegistry()
    },
  })
  const updateModel = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof modelApi.update>[1] }) => modelApi.update(id, payload),
    onSuccess: () => {
      resetModelForm()
      setModelModalOpen(false)
      refreshRegistry()
    },
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
    setProviderModalOpen(true)
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
    setModelModalOpen(true)
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
        <section data-id="model-registry-actions" className="harness-actions-section">
          <div className="harness-actions-row">
            <p className="harness-actions-label">Registry actions</p>
            <div className="flex flex-wrap gap-3">
              <Button data-id="add-model-registry-button" onClick={openCreateProviderModal} type="button">
                Add Model Registry
              </Button>
              <Button data-id="create-model-button" onClick={openCreateModelModal} type="button" variant="secondary">
                Create Model
              </Button>
            </div>
          </div>
        </section>
      ) : null}
      {message ? <p data-id="model-registry-message" className="harness-subtitle">{message}</p> : null}
      <div data-id="providers-list" className="harness-tablewrap overflow-x-auto">
        <table>
          <thead>
            <tr><th>Provider</th><th>Adapter</th><th>Status</th>{embedded ? <th aria-label="actions" /> : null}</tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr data-id={`provider-card-${provider.id}`} key={provider.id}>
                <td className="font-semibold text-[var(--ink)]">{provider.displayName || provider.name}</td>
                <td><span className="harness-code-inline">{provider.adapterKey}</span></td>
                <td><Badge variant={provider.enabled ? 'tag' : 'secondary'}>{provider.enabled ? 'enabled' : 'disabled'}</Badge></td>
                {embedded ? (
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button data-id={`provider-edit-${provider.id}`} variant="secondary" size="sm" onClick={() => editProvider(provider)}>Edit</Button>
                      <Button data-id={`provider-test-${provider.id}`} variant="secondary" size="sm" onClick={() => testProvider.mutate(provider.id)}>Test</Button>
                      <Button data-id={`provider-disable-${provider.id}`} variant="ghost" size="sm" onClick={() => updateProvider.mutate({ id: provider.id, payload: { ...provider, displayName: provider.displayName || provider.name, enabled: !provider.enabled } })}>{provider.enabled ? 'Disable' : 'Enable'}</Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {models.length === 0 ? <EmptyState id="models-empty" message="No model definitions found." /> : null}
      <div data-id="models-list" className="harness-tablewrap overflow-x-auto">
        <table>
          <thead>
            <tr><th>Model</th><th>Model name</th><th>ID</th><th>Default</th>{embedded ? <th aria-label="actions" /> : null}</tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr data-id={`model-card-${model.id}`} key={model.id}>
                <td className="font-semibold text-[var(--ink)]">{model.displayName}</td>
                <td className="text-[var(--steel)]">{model.modelName}</td>
                <td><span className="harness-code-inline">{model.id}</span></td>
                <td>{model.isDefault ? <Badge data-id={`model-default-${model.id}`} variant="tag">default</Badge> : <span className="text-[var(--muted)]">&mdash;</span>}</td>
                {embedded ? (
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button data-id={`model-edit-${model.id}`} variant="secondary" size="sm" onClick={() => editModel(model)}>Edit</Button>
                      <Button data-id={`model-default-action-${model.id}`} variant="secondary" size="sm" onClick={() => setDefault.mutate(model.id)}>Set default</Button>
                      <Button data-id={`model-test-${model.id}`} variant="secondary" size="sm" onClick={() => testModel.mutate(model.id)}>Test</Button>
                      <Button data-id={`model-delete-${model.id}`} variant="ghost" size="sm" onClick={() => deleteModel.mutate(model.id)}>Disable</Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        onOpenChange={(open) => {
          setProviderModalOpen(open)
          if (!open) {
            resetProviderForm()
          }
        }}
        open={providerModalOpen}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl" data-id="provider-modal">
          <DialogHeader>
            <DialogTitle>{providerForm.id ? 'Edit Provider' : 'Create Provider'}</DialogTitle>
            <DialogDescription>Use secret references, not raw API keys.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={submitProvider}>
            <input data-id="provider-key-input" className="harness-input" placeholder="provider key" value={providerForm.key} onChange={(event) => setProviderForm({ ...providerForm, key: event.target.value })} required />
            <input data-id="provider-name-input" className="harness-input" placeholder="display name" value={providerForm.displayName} onChange={(event) => setProviderForm({ ...providerForm, displayName: event.target.value })} required />
            <input data-id="provider-adapter-input" className="harness-input" placeholder="adapter key" value={providerForm.adapterKey} onChange={(event) => setProviderForm({ ...providerForm, adapterKey: event.target.value })} required />
            <input data-id="provider-base-url-input" className="harness-input" placeholder="base URL" value={providerForm.baseUrl} onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })} />
            <input data-id="provider-secret-ref-input" className="harness-input" placeholder="secret ref, e.g. OPENAI_API_KEY" value={providerForm.secretRef} onChange={(event) => setProviderForm({ ...providerForm, secretRef: event.target.value })} />
            <textarea data-id="provider-config-input" className="harness-input min-h-24 font-mono text-xs" value={providerForm.configJson} onChange={(event) => setProviderForm({ ...providerForm, configJson: event.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={providerForm.enabled} onChange={(event) => setProviderForm({ ...providerForm, enabled: event.target.checked })} /> Enabled</label>
            <DialogFooter>
              <Button data-id="provider-cancel" onClick={() => setProviderModalOpen(false)} type="button" variant="secondary">Cancel</Button>
              <Button data-id="provider-submit" type="submit">{providerForm.id ? 'Update provider' : 'Create provider'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          setModelModalOpen(open)
          if (!open) {
            resetModelForm()
          }
        }}
        open={modelModalOpen}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl" data-id="model-modal">
          <DialogHeader>
            <DialogTitle>{modelForm.id ? 'Edit Model' : 'Create Model'}</DialogTitle>
            <DialogDescription>Capabilities, cost config, and adapter config are JSON.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={submitModel}>
            <select data-id="model-provider-input" className="harness-input" value={modelForm.providerId} onChange={(event) => handleModelProviderChange(event.target.value)} required>
              <option value="">Select provider</option>
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName || provider.name}</option>)}
            </select>
            {selectedModelPreset ? (
              <p data-id="model-compatibility-help" className="harness-subtitle">{selectedModelPreset.help}</p>
            ) : null}
            {openAIComputerUseMismatch ? (
              <p data-id="model-compatibility-warning" className="text-sm text-[var(--brand-error)]">
                This adapter uses computer_use_preview and requires modelName computer-use-preview.
              </p>
            ) : null}
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
            <DialogFooter>
              <Button data-id="model-cancel" onClick={() => setModelModalOpen(false)} type="button" variant="secondary">Cancel</Button>
              <Button data-id="model-submit" type="submit">{modelForm.id ? 'Update model' : 'Create model'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
