import { useEffect, useRef, useState } from 'react'

import { apiBaseUrl, tokenStore } from '@/lib/api'

export type BatchEventType =
  | 'batch.created'
  | 'batch.summary_updated'
  | 'user.action'
  | 'snapshot.required'
  | 'iteration.enqueued'
  | 'iteration.started'
  | 'iteration.step_added'
  | 'artifact.created'
  | 'iteration.completed'
  | 'iteration.cancelled'
  | 'execution.updated'
  | 'report.ready'
  | 'iteration.lease_expired'

export type BatchEventEnvelope = {
  version: 'v1'
  type: BatchEventType
  id: string
  batch_id: string
  execution_id?: string
  iteration_id?: string
  occurred_at: string
  sequence?: string
  payload: Record<string, unknown>
}

export type BatchEventConnectionState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'fallback'

export function useBatchEvents(batchId: string | undefined, onEvent: (event: BatchEventEnvelope) => void, onFallback: () => void) {
  const [connectionState, setConnectionState] = useState<BatchEventConnectionState>('idle')
  const [latestEventId, setLatestEventId] = useState('')
  const lastEventRef = useRef('')

  useEffect(() => {
    const token = tokenStore.getAccessToken()
    if (!batchId || !token) {
      return
    }

    const params = new URLSearchParams({ access_token: token })
    if (lastEventRef.current) {
      params.set('last_event_id', lastEventRef.current)
    }
    const url = `${apiBaseUrl}/api/batches/${batchId}/events?${params.toString()}`

    queueMicrotask(() => setConnectionState(lastEventRef.current ? 'reconnecting' : 'connecting'))
    const source = new EventSource(url)

    source.onopen = () => setConnectionState('live')
    source.onerror = () => {
      setConnectionState('fallback')
      source.close()
      onFallback()
    }

    const handleMessage = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as BatchEventEnvelope
        lastEventRef.current = message.lastEventId || event.sequence || lastEventRef.current
        setLatestEventId(lastEventRef.current)
        if (event.type === 'snapshot.required') {
          setConnectionState('fallback')
          onFallback()
          return
        }
        onEvent(event)
      } catch {
        setConnectionState('fallback')
        onFallback()
      }
    }

    const eventTypes: BatchEventType[] = [
      'batch.created',
      'batch.summary_updated',
      'user.action',
      'snapshot.required',
      'iteration.enqueued',
      'iteration.started',
      'iteration.step_added',
      'artifact.created',
      'iteration.completed',
      'iteration.cancelled',
      'execution.updated',
      'report.ready',
      'iteration.lease_expired',
    ]
    eventTypes.forEach((eventType) => source.addEventListener(eventType, handleMessage))
    source.onmessage = handleMessage

    return () => {
      eventTypes.forEach((eventType) => source.removeEventListener(eventType, handleMessage))
      source.close()
    }
  }, [batchId, onEvent, onFallback])

  return { connectionState, latestEventId }
}
