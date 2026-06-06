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
  verificationStrategy: string
  taskCount?: number
}

export type Task = {
  id: string
  gymId: string
  taskId: string
  prompt: string
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

export type BatchSnapshot = {
  batch: Batch
  executions: Array<{ id: string; status: string; snapshotPrompt: string }>
  iterations: Array<{ id: string; status: string; iterationNumber: number }>
  counts: Record<string, number>
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  })
  const body = (await response.json()) as ApiEnvelope<T>
  if (!response.ok || !body.success || body.data === undefined) {
    throw new Error(body.message || 'request failed')
  }
  return body.data
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  listGyms: (token: string) => request<Gym[]>('/api/gyms', {}, token),
  createGym: (token: string, name: string, baseUrl: string) =>
    request<Gym>(
      '/api/gyms',
      {
        method: 'POST',
        body: JSON.stringify({ name, baseUrl, verificationStrategy: 'verification_endpoint' }),
      },
      token,
    ),
  listTasks: (token: string) => request<Task[]>('/api/tasks', {}, token),
  createTask: (token: string, gymId: string, taskId: string, prompt: string) =>
    request<Task>(
      '/api/tasks',
      {
        method: 'POST',
        body: JSON.stringify({ gymId, taskId, prompt }),
      },
      token,
    ),
  listModels: (token: string) => request<ModelDefinition[]>('/api/models', {}, token),
  createBatch: (token: string, gymId: string, taskIds: string[], modelIds: string[]) =>
    request<Batch>(
      '/api/batches',
      {
        method: 'POST',
        body: JSON.stringify({ name: 'Phase 2 Smoke Batch', gymId, taskIds, modelIds, iterationCount: 1, rerunEnabled: true }),
      },
      token,
    ),
  getBatchSnapshot: (token: string, batchId: string) =>
    request<BatchSnapshot>(`/api/batches/${batchId}/snapshot`, {}, token),
}
