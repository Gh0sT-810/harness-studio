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

  if (event.type === 'execution.updated') {
    const executionId =
      event.execution_id ?? (typeof event.payload.execution_id === 'string' ? event.payload.execution_id : undefined)
    const status = typeof event.payload.status === 'string' ? event.payload.status : undefined
    if (!executionId) {
      return { ...state, recentEvents }
    }
    return {
      ...state,
      executions: state.executions.map((execution) =>
        execution.id === executionId && status ? { ...execution, status } : execution,
      ),
      recentEvents,
    }
  }

  if ([
    'iteration.enqueued',
    'iteration.started',
    'iteration.completed',
    'iteration.cancelled',
    'iteration.lease_expired',
  ].includes(event.type) && event.iteration_id) {
    const status = typeof event.payload.status === 'string' ? event.payload.status : undefined
    const subStatus = typeof event.payload.sub_status === 'string' ? event.payload.sub_status : undefined
    const workerId = typeof event.payload.worker_id === 'string' ? event.payload.worker_id : undefined
    const celeryTaskId = typeof event.payload.celery_task_id === 'string' ? event.payload.celery_task_id : undefined
    return {
      ...state,
      iterations: state.iterations.map((iteration) =>
        iteration.id === event.iteration_id
          ? {
              ...iteration,
              ...(status ? { status } : {}),
              ...(subStatus ? { subStatus } : {}),
              ...(workerId ? { workerId } : {}),
              ...(celeryTaskId ? { celeryTaskId } : {}),
              ...(event.type === 'iteration.cancelled' ? { cancelRequested: true } : {}),
            }
          : iteration,
      ),
      recentEvents,
    }
  }

  if (event.type === 'artifact.created' && event.iteration_id) {
    const artifactId = typeof event.payload.artifactId === 'string' ? event.payload.artifactId : undefined
    const artifactType = typeof event.payload.artifactType === 'string' ? event.payload.artifactType : undefined
    const scope = typeof event.payload.scope === 'string' ? event.payload.scope : undefined
    if (artifactId && artifactType && scope) {
      return {
        ...state,
        iterations: state.iterations.map((iteration) =>
          iteration.id === event.iteration_id
            ? {
                ...iteration,
                timelineArtifactId: artifactType === 'timeline' ? artifactId : iteration.timelineArtifactId,
                artifacts: [
                  ...(iteration.artifacts ?? []),
                  {
                    artifactId,
                    artifactType,
                    scope,
                    filename: typeof event.payload.filename === 'string' ? event.payload.filename : undefined,
                    iterationId: typeof event.payload.iterationId === 'string' ? event.payload.iterationId : undefined,
                    executionId: typeof event.payload.executionId === 'string' ? event.payload.executionId : undefined,
                    timelineStepIndex: typeof event.payload.timelineStepIndex === 'number' ? event.payload.timelineStepIndex : undefined,
                  },
                ],
              }
            : iteration,
        ),
        recentEvents,
      }
    }
  }

  if (event.type === 'report.ready') {
    return {
      ...state,
      report: {
        ...state.report,
        status: typeof event.payload.status === 'string' ? event.payload.status : 'completed',
        reportJobId: typeof event.payload.reportId === 'string' ? event.payload.reportId : state.report?.reportJobId,
        artifactId: typeof event.payload.artifactId === 'string' ? event.payload.artifactId : state.report?.artifactId,
        completedAt: typeof event.payload.completedAt === 'string' ? event.payload.completedAt : state.report?.completedAt,
      },
      recentEvents,
    }
  }

  return { ...state, recentEvents }
}
