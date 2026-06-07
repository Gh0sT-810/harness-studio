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
}

export type ModelDefinition = {
  id: string
  displayName: string
  modelName: string
  isDefault: boolean
}

export type Batch = {
  id: string
  name: string
  gymId: string
  status: string
  iterationCount: number
}

export type Domain = {
  id: string
  domain: string
  isAllowed: boolean
}

export type BatchSnapshot = {
  batch: Batch
  executions: Array<{ id: string; status: string; snapshotPrompt: string }>
  iterations: Array<{
    id: string
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
  }>
  counts: Record<string, number>
  report?: Record<string, unknown>
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
  create: (payload: { gymId: string; taskId: string; prompt: string; graderConfig?: Record<string, unknown>; simulatorConfig?: Record<string, unknown>; dbJsonValidator?: Record<string, unknown>; verifierPath?: string }) =>
    request<Task>(
      '/api/tasks',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  update: (id: string, payload: { gymId: string; taskId: string; prompt: string; graderConfig?: Record<string, unknown>; simulatorConfig?: Record<string, unknown>; dbJsonValidator?: Record<string, unknown>; verifierPath?: string }) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  delete: (id: string) => request<Record<string, never>>(`/api/tasks/${id}`, { method: 'DELETE' }),
}

export const modelApi = {
  list: () => request<ModelDefinition[]>('/api/models'),
  listProviders: () => request<Array<{ id: string; name: string; adapterKey: string }>>('/api/model-providers'),
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
  cancel: (batchId: string) => request<{ id: string }>(`/api/batches/${batchId}/cancel`, { method: 'POST' }),
}

export const api = {
  auth: authApi,
  gyms: gymApi,
  tasks: taskApi,
  models: modelApi,
  batches: batchApi,
}
