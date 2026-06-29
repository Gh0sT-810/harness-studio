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
  passRate: 0.74,
  runs: 12,
  updatedAt: '2026-06-20T10:00:00Z',
}

export const mockTask = {
  id: 't1',
  gymId: 'g1',
  taskId: 'TASK-1',
  prompt: 'Do the thing',
  difficulty: 'medium',
  status: 'enabled',
  runs: 8,
  passRate: 0.625,
  avgSteps: 14.2,
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
  key: 'local',
  name: 'Local Provider',
  displayName: 'Local Provider',
  adapterKey: 'local',
  enabled: true,
  secretRef: 'LOCAL_KEY',
  connectionStatus: 'connected',
}

export const mockBatch = {
  id: 'b1',
  name: 'Demo Batch',
  gymId: 'g1',
  status: 'pending',
  iterationCount: 1,
  passRate: 0.5,
  cost: 1.23,
  models: 'Local Test Model',
}

export const mockLeaderboardRow = {
  modelId: 'm1',
  modelName: 'Local Test Model',
  gymId: 'g1',
  gymName: 'Demo Gym',
  runs: 10,
  passed: 7,
  failed: 3,
  passRate: 0.7,
  averageSteps: 15.5,
  averageSeconds: 42.1,
  totalTokens: 12000,
  totalCostUsd: 1.42,
  trend: [0.5, 0.6, 0.65, 0.7],
}

export const mockUsageSummary = {
  inputTokens: 8000,
  outputTokens: 4000,
  totalTokens: 12000,
  totalCostUsd: 1.42,
  runs: 10,
  byModel: [{ id: 'm1', name: 'Local Test Model', totalTokens: 12000, totalCostUsd: 1.42, runs: 10 }],
  byGym: [{ id: 'g1', name: 'Demo Gym', totalTokens: 12000, totalCostUsd: 1.42, runs: 10 }],
  series: [
    { date: '2026-06-18', totalTokens: 3000, totalCostUsd: 0.4 },
    { date: '2026-06-19', totalTokens: 5000, totalCostUsd: 0.6 },
    { date: '2026-06-20', totalTokens: 4000, totalCostUsd: 0.42 },
  ],
}

export const mockBatchAnalytics = {
  total: 4,
  passed: 3,
  passRate: 0.75,
  avgSteps: 16.5,
  byTask: [
    { taskId: 'TASK-1', total: 2, passed: 2, passRate: 1 },
    { taskId: 'TASK-2', total: 2, passed: 1, passRate: 0.5 },
  ],
  iterations: [
    { id: 'i1', taskId: 'TASK-1', status: 'passed', steps: 15, tokens: 3000, costUsd: 0.42 },
    { id: 'i2', taskId: 'TASK-2', status: 'failed', steps: 18, tokens: 3200, costUsd: 0.48 },
  ],
}

export const mockReportJob = {
  id: 'r1',
  jobType: 'batch_report',
  scopeType: 'batch',
  scopeId: 'b1',
  format: 'json',
  status: 'completed',
  generatedArtifactId: 'artifact-report-1',
  payload: {
    artifacts: {
      json: { id: 'artifact-report-1', filename: 'batch_report.json', contentType: 'application/json' },
      csv: { id: 'artifact-report-csv-1', filename: 'batch_report.csv', contentType: 'text/csv' },
      xlsx: { id: 'artifact-report-xlsx-1', filename: 'batch_report.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    },
  },
}

export const mockDomain = {
  id: 'd1',
  domain: 'example.com',
  isAllowed: true,
}
