export const routes = {
  login: '/login',
  gyms: '/gyms',
  tasks: '/tasks',
  models: '/models',
  batches: '/batches',
  batchSnapshot: '/batches/b1/runs',
  admin: '/admin',
}

export const seededAdmin = {
  id: 'u1',
  email: 'test@example.com',
  displayName: 'Test Admin',
  role: 'admin',
  password: 'Test@$1234',
}

export const mockGym = {
  id: 'g1',
  name: 'Demo Gym',
  baseUrl: 'https://example.com',
  verificationStrategy: 'verification_endpoint',
  taskCount: 1,
}

export const mockTask = {
  id: 't1',
  gymId: 'g1',
  taskId: 'TASK-1',
  prompt: 'Do the thing',
}

export const mockModel = {
  id: 'm1',
  providerId: 'p1',
  modelName: 'local-test-model',
  displayName: 'Local Test Model',
  isDefault: true,
}

export const mockProvider = {
  id: 'p1',
  name: 'Local Provider',
  adapterKey: 'local',
}

export const mockBatch = {
  id: 'b1',
  name: 'Demo Batch',
  gymId: 'g1',
  status: 'pending',
  iterationCount: 1,
}

export const mockDomain = {
  id: 'd1',
  domain: 'example.com',
  isAllowed: true,
}
