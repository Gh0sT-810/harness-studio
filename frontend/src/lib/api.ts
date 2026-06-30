export type ApiEnvelope<T> = {
  success: boolean
  message: string
  statusCode: number
  data?: T
}

export type User = {
  id: string
  email: string
  displayName: string
  role: string
  isActive?: boolean
  isWhitelisted?: boolean
}

export type LoginResponse = {
  accessToken: string
  refreshToken: string
  user: User
}

export type Gym = {
  id: string
  name: string
  baseUrl: string
  description?: string
  verificationStrategy: string
  flowCount?: number
  similarityEnabled?: boolean
  similarityThreshold?: number
  taskCount?: number
  passRate?: number
  runs?: number
  updatedAt?: string
}

export type Task = {
  id: string
  gymId: string
  taskId: string
  prompt: string
  graderConfig?: Record<string, unknown>
  simulatorConfig?: Record<string, unknown>
  dbJsonValidator?: Record<string, unknown>
  verifierPath?: string
  difficulty?: string
  status?: string
  maxSteps?: number
  startUrl?: string
  runs?: number
  passRate?: number
  avgSteps?: number
}

export type ModelDefinition = {
  id: string
  providerId: string
  displayName: string
  modelName: string
  capabilities?: Record<string, unknown>
  config?: Record<string, unknown>
  costConfig?: Record<string, unknown>
  timeoutSeconds?: number
  maxOutputTokens?: number
  enabled?: boolean
  isDefault: boolean
}

export type ModelProvider = {
  id: string
  key: string
  name: string
  displayName: string
  adapterKey: string
  baseUrl?: string
  secretRef?: string
  enabled: boolean
  config?: Record<string, unknown>
  connectionStatus?: string
  lastTestedAt?: string
}

export type ModelTestResult = {
  status: string
  message: string
}

export type SystemConfig = {
  key: string
  value: Record<string, unknown>
  updatedAt?: string
}

export type Batch = {
  id: string
  name: string
  gymId: string
  status: string
  iterationCount: number
  passRate?: number
  cost?: number
  models?: string
  createdAt?: string
}

export type Domain = {
  id: string
  domain: string
  isAllowed: boolean
}

export type BatchSnapshot = {
  batch: Batch
  executions: Array<{
    id: string
    status: string
    taskId?: string
    modelId?: string
    snapshotTaskId?: string
    snapshotPrompt: string
  }>
  iterations: Array<{
    id: string
    executionId: string
    status: string
    iterationNumber: number
    subStatus?: string
    celeryTaskId?: string
    workerId?: string
    heartbeatAt?: string
    leaseExpiresAt?: string
    cancelRequested?: boolean
    cancelledAt?: string
    startedAt?: string
    completedAt?: string
    timelineArtifactId?: string
    resultData?: { error?: string; runner?: string }
    totalSteps?: number
    cost?: number
    artifacts?: ArtifactSummary[]
  }>
  counts: Record<string, number>
  report?: ReportReadiness
  catalog?: {
    gyms?: Record<string, Gym>
    tasks?: Record<string, Task>
    models?: Record<string, ModelDefinition>
  }
}

export type ReportReadiness = {
  status: string
  reportJobId?: string
  artifactId?: string
  requestedAt?: string
  completedAt?: string
  error?: string
}

export type ReportArtifactDescriptor = {
  id: string
  filename: string
  contentType: string
}

export type ReportJob = {
  id: string
  jobType?: string
  scopeType?: string
  scopeId?: string
  format?: string
  status: string
  generatedArtifactId?: string
  error?: string
  createdAt?: string
  startedAt?: string
  completedAt?: string
  payload?: {
    artifacts?: {
      json?: ReportArtifactDescriptor
      csv?: ReportArtifactDescriptor
      xlsx?: ReportArtifactDescriptor
    }
  }
}

export type TokenUsageSummary = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  totalCostUsd: number
  runs: number
  byModel: Array<{ id: string; name: string; totalTokens: number; totalCostUsd: number; runs: number }>
  byGym: Array<{ id: string; name: string; totalTokens: number; totalCostUsd: number; runs: number }>
  series?: Array<{ date: string; totalTokens: number; totalCostUsd: number }>
}

export type LeaderboardRow = {
  modelId: string
  modelName: string
  gymId: string
  gymName: string
  runs: number
  passed: number
  failed: number
  passRate: number
  averageSteps: number
  averageSeconds: number
  totalTokens: number
  totalCostUsd: number
  trend?: number[]
}

export type ArtifactSummary = {
  artifactId: string
  artifactType: string
  scope: string
  filename?: string
  iterationId?: string
  executionId?: string
  timelineStepIndex?: number
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
let refreshInFlight: Promise<LoginResponse> | null = null

export const tokenStore = {
  getAccessToken: () => localStorage.getItem('auth_token') ?? '',
  getRefreshToken: () => localStorage.getItem('refresh_token') ?? '',
  setTokens: (tokens: Pick<LoginResponse, 'accessToken' | 'refreshToken'>) => {
    localStorage.setItem('auth_token', tokens.accessToken)
    localStorage.setItem('refresh_token', tokens.refreshToken)
  },
  clear: () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('refresh_token')
  },
}

async function request<T>(path: string, options: RequestInit = {}, accessToken = tokenStore.getAccessToken(), retry = true): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  })
  const body = (await response.json()) as ApiEnvelope<T>
  if (response.status === 401 && retry && tokenStore.getRefreshToken()) {
    refreshInFlight ??= authApi.refresh(tokenStore.getRefreshToken()).finally(() => {
      refreshInFlight = null
    })
    const refreshed = await refreshInFlight
    tokenStore.setTokens(refreshed)
    return request<T>(path, options, refreshed.accessToken, false)
  }
  if (!response.ok || !body.success || body.data === undefined) {
    throw new Error(body.message || 'request failed')
  }
  return body.data
}

export const authApi = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, '', false),
  refresh: (refreshToken: string) =>
    request<LoginResponse>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }, '', false),
  logout: (refreshToken: string) =>
    request<Record<string, never>>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  me: () => request<User>('/api/me'),
  listUsers: () => request<User[]>('/api/users'),
  updateUserRole: (id: string, role: string) =>
    request<User>(`/api/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  listDomains: () => request<Domain[]>('/api/domains'),
  createDomain: (domain: string) =>
    request<Domain>('/api/domains', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }),
  deleteDomain: (id: string) => request<Record<string, never>>(`/api/domains/${id}`, { method: 'DELETE' }),
}

export const gymApi = {
  list: () => request<Gym[]>('/api/gyms'),
  create: (payload: Partial<Gym> & { name: string; baseUrl: string }) =>
    request<Gym>(
      '/api/gyms',
      {
        method: 'POST',
        body: JSON.stringify({ verificationStrategy: 'verification_endpoint', ...payload }),
      },
    ),
  update: (id: string, payload: Partial<Gym> & { name: string; baseUrl: string }) =>
    request<Gym>(`/api/gyms/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ verificationStrategy: 'verification_endpoint', ...payload }),
    }),
  delete: (id: string) => request<Record<string, never>>(`/api/gyms/${id}`, { method: 'DELETE' }),
}

export const taskApi = {
  list: () => request<Task[]>('/api/tasks'),
  create: (payload: { gymId: string; taskId: string; prompt: string; graderConfig?: Record<string, unknown>; simulatorConfig?: Record<string, unknown>; dbJsonValidator?: Record<string, unknown>; verifierPath?: string; difficulty?: string; status?: string; maxSteps?: number; startUrl?: string }) =>
    request<Task>(
      '/api/tasks',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  update: (id: string, payload: { gymId: string; taskId: string; prompt: string; graderConfig?: Record<string, unknown>; simulatorConfig?: Record<string, unknown>; dbJsonValidator?: Record<string, unknown>; verifierPath?: string; difficulty?: string; status?: string; maxSteps?: number; startUrl?: string }) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  delete: (id: string) => request<Record<string, never>>(`/api/tasks/${id}`, { method: 'DELETE' }),
}

export const modelApi = {
  list: () => request<ModelDefinition[]>('/api/models'),
  listProviders: () => request<ModelProvider[]>('/api/model-providers'),
  createProvider: (payload: Partial<ModelProvider> & { key: string; displayName: string; adapterKey: string }) =>
    request<ModelProvider>('/api/model-providers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProvider: (id: string, payload: Partial<ModelProvider> & { key: string; displayName: string; adapterKey: string }) =>
    request<ModelProvider>(`/api/model-providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  testProvider: (id: string) => request<ModelTestResult>(`/api/model-providers/${id}/test`, { method: 'POST' }),
  create: (payload: Partial<ModelDefinition> & { providerId: string; modelName: string; displayName: string }) =>
    request<ModelDefinition>('/api/models', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Partial<ModelDefinition> & { providerId: string; modelName: string; displayName: string }) =>
    request<ModelDefinition>(`/api/models/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  setDefault: (id: string) => request<ModelDefinition>(`/api/models/${id}/default`, { method: 'POST' }),
  test: (id: string) => request<ModelTestResult>(`/api/models/${id}/test`, { method: 'POST' }),
  delete: (id: string) => request<Record<string, never>>(`/api/models/${id}`, { method: 'DELETE' }),
  getRuntimeConfig: () => request<SystemConfig>('/api/admin/runtime-config'),
  updateRuntimeConfig: (value: Record<string, unknown>) =>
    request<SystemConfig>('/api/admin/runtime-config', {
      method: 'PUT',
      body: JSON.stringify(value),
    }),
  getEmbeddingConfig: () => request<SystemConfig>('/api/admin/embedding-config'),
  updateEmbeddingConfig: (value: Record<string, unknown>) =>
    request<SystemConfig>('/api/admin/embedding-config', {
      method: 'PUT',
      body: JSON.stringify(value),
    }),
}

export type WorkerInfo = {
  id: string
  name: string
  state: string
  activity: string
}

export type WorkerStatus = {
  desired: number | null
  actual: number
  total: number
  flowerAvailable: boolean
  workers: WorkerInfo[]
}

export const adminApi = {
  getWorkers: () => request<WorkerStatus>('/api/admin/workers'),
  scaleWorkers: (replicas: number) =>
    request<Record<string, unknown>>('/api/admin/workers/scale', {
      method: 'POST',
      body: JSON.stringify({ replicas }),
    }),
  stopIdleWorkers: (count?: number) =>
    request<Record<string, unknown>>('/api/admin/workers/stop-idle', {
      method: 'POST',
      body: JSON.stringify(count != null ? { count } : {}),
    }),
  restartWorker: (id: string) =>
    request<Record<string, unknown>>(`/api/admin/workers/${encodeURIComponent(id)}/restart`, {
      method: 'POST',
    }),
}

export type BatchAnalytics = {
  total: number
  passed: number
  passRate: number
  avgSteps: number
  byTask: Array<{ taskId: string; total: number; passed: number; passRate: number }>
  iterations: Array<{ id: string; taskId: string; status: string; steps: number; tokens: number; costUsd: number }>
}

export const batchApi = {
  list: () => request<Batch[]>('/api/batches'),
  create: (gymId: string, taskIds: string[], modelIds: string[], iterationCount: number, name = 'Phase 2 Batch') =>
    request<Batch>(
      '/api/batches',
      {
        method: 'POST',
        body: JSON.stringify({ name, gymId, taskIds, modelIds, iterationCount, rerunEnabled: true }),
      },
    ),
  snapshot: (batchId: string) => request<BatchSnapshot>(`/api/batches/${batchId}/snapshot`),
  analytics: (batchId: string) => request<BatchAnalytics>(`/api/batches/${batchId}/analytics`),
  cancel: (batchId: string) => request<{ id: string }>(`/api/batches/${batchId}/cancel`, { method: 'POST' }),
  createReport: (batchId: string) => request<ReportJob>(`/api/batches/${batchId}/report`, { method: 'POST' }),
  report: (batchId: string) => request<ReportJob>(`/api/batches/${batchId}/report`),
}

export const reportApi = {
  create: (payload: { scopeId: string; scopeType?: string; jobType?: string; format?: string }) =>
    request<ReportJob>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  get: (id: string) => request<ReportJob>(`/api/reports/${id}`),
}

export const usageApi = {
  summary: (params?: { from?: string; to?: string; batchId?: string; gymId?: string; modelId?: string }) => {
    const entries = Object.entries(params ?? {}).filter(([, value]) => value)
    const qs = entries.length ? `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()}` : ''
    return request<TokenUsageSummary>(`/api/usage/summary${qs}`)
  },
  filters: () => request<{ batches: Array<{ id: string; name: string }>; gyms: Array<{ id: string; name: string }>; models: Array<{ id: string; name: string }> }>('/api/usage/filters'),
  csvUrl: () => `${apiBaseUrl}/api/usage/export/csv`,
}

export const leaderboardApi = {
  list: () => request<LeaderboardRow[]>('/api/leaderboard'),
}

export const api = {
  auth: authApi,
  gyms: gymApi,
  tasks: taskApi,
  models: modelApi,
  batches: batchApi,
  reports: reportApi,
  usage: usageApi,
  leaderboard: leaderboardApi,
  admin: adminApi,
}
