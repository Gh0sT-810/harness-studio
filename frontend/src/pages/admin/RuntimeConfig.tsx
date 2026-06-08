import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { modelApi } from '@/lib/api'

function pretty(value: Record<string, unknown> | undefined, fallback: Record<string, unknown>) {
  return JSON.stringify(value && Object.keys(value).length > 0 ? value : fallback, null, 2)
}

export function RuntimeConfig() {
  const queryClient = useQueryClient()
  const runtimeQuery = useQuery({ queryKey: ['runtime-config'], queryFn: modelApi.getRuntimeConfig })
  const embeddingQuery = useQuery({ queryKey: ['embedding-config'], queryFn: modelApi.getEmbeddingConfig })
  const [runtimeDraft, setRuntimeDraft] = useState('')
  const [embeddingDraft, setEmbeddingDraft] = useState('')
  const [message, setMessage] = useState('')

  const runtimeValue = useMemo(
    () => pretty(runtimeQuery.data?.value, { defaultModelId: '', defaultExecutionTimeoutSeconds: 300, modelCallTimeoutSeconds: 60, featureFlags: {} }),
    [runtimeQuery.data?.value],
  )
  const embeddingValue = useMemo(
    () => pretty(embeddingQuery.data?.value, { providerKey: 'text', modelId: '', secretRef: '' }),
    [embeddingQuery.data?.value],
  )

  const saveRuntime = useMutation({
    mutationFn: (value: Record<string, unknown>) => modelApi.updateRuntimeConfig(value),
    onSuccess: () => {
      setMessage('Runtime config saved')
      void queryClient.invalidateQueries({ queryKey: ['runtime-config'] })
    },
  })
  const saveEmbedding = useMutation({
    mutationFn: (value: Record<string, unknown>) => modelApi.updateEmbeddingConfig(value),
    onSuccess: () => {
      setMessage('Embedding config saved')
      void queryClient.invalidateQueries({ queryKey: ['embedding-config'] })
    },
  })

  function parse(value: string) {
    return JSON.parse(value) as Record<string, unknown>
  }

  function saveRuntimeConfig() {
    try {
      saveRuntime.mutate(parse(runtimeDraft || runtimeValue))
    } catch {
      setMessage('Runtime config must be valid JSON')
    }
  }

  function saveEmbeddingConfig() {
    try {
      saveEmbedding.mutate(parse(embeddingDraft || embeddingValue))
    } catch {
      setMessage('Embedding config must be valid JSON')
    }
  }

  return (
    <div data-id="runtime-config-page" className="grid gap-4 lg:grid-cols-2">
      <Card className="harness-card-padding">
        <CardHeader>
          <CardTitle>Runtime Config</CardTitle>
          <CardDescription>Default model ids, execution timeouts, model call timeouts, and feature flags.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <textarea data-id="runtime-config-input" className="harness-input min-h-64 font-mono text-xs" value={runtimeDraft || runtimeValue} onChange={(event) => setRuntimeDraft(event.target.value)} />
          <Button data-id="runtime-config-save" onClick={saveRuntimeConfig}>Save runtime config</Button>
        </CardContent>
      </Card>
      <Card className="harness-card-padding">
        <CardHeader>
          <CardTitle>Embedding Config</CardTitle>
          <CardDescription>Embedding provider/model selection with secret references only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <textarea data-id="embedding-config-input" className="harness-input min-h-64 font-mono text-xs" value={embeddingDraft || embeddingValue} onChange={(event) => setEmbeddingDraft(event.target.value)} />
          <Button data-id="embedding-config-save" onClick={saveEmbeddingConfig}>Save embedding config</Button>
        </CardContent>
      </Card>
      {message ? <p data-id="runtime-config-message" className="harness-subtitle lg:col-span-2">{message}</p> : null}
    </div>
  )
}
