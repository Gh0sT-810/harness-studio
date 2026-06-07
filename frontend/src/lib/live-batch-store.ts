import { BatchSnapshot } from '@/lib/api'
import { BatchEventEnvelope } from '@/lib/batch-events'

export type LiveBatchState = BatchSnapshot & {
  recentEvents: BatchEventEnvelope[]
}

export function createLiveBatchState(snapshot: BatchSnapshot): LiveBatchState {
  return {
    ...snapshot,
    report: snapshot.report ?? { status: 'not_configured' },
    recentEvents: [],
  }
}

export function applyBatchEvent(state: LiveBatchState, event: BatchEventEnvelope): LiveBatchState {
  const recentEvents = [event, ...state.recentEvents].slice(0, 10)

  if (event.type === 'batch.summary_updated') {
    const counts = event.payload.counts
    if (counts && typeof counts === 'object') {
      return { ...state, counts: counts as Record<string, number>, recentEvents }
    }
  }

  if (event.type === 'execution.updated' && event.execution_id) {
    const status = typeof event.payload.status === 'string' ? event.payload.status : undefined
    return {
      ...state,
      executions: state.executions.map((execution) =>
        execution.id === event.execution_id && status ? { ...execution, status } : execution,
      ),
      recentEvents,
    }
  }

  if ((event.type === 'iteration.started' || event.type === 'iteration.completed') && event.iteration_id) {
    const status = typeof event.payload.status === 'string' ? event.payload.status : undefined
    return {
      ...state,
      iterations: state.iterations.map((iteration) =>
        iteration.id === event.iteration_id && status ? { ...iteration, status } : iteration,
      ),
      recentEvents,
    }
  }

  if (event.type === 'report.ready') {
    return { ...state, report: { ...state.report, status: 'ready', ...event.payload }, recentEvents }
  }

  return { ...state, recentEvents }
}
