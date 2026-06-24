import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'

const Admin = lazy(() => import('@/pages/Admin').then((m) => ({ default: m.Admin })))
const Batches = lazy(() => import('@/pages/Batches').then((m) => ({ default: m.Batches })))
const BatchSnapshotPage = lazy(() => import('@/pages/BatchSnapshot').then((m) => ({ default: m.BatchSnapshotPage })))
const Gyms = lazy(() => import('@/pages/Gyms').then((m) => ({ default: m.Gyms })))
const Leaderboard = lazy(() => import('@/pages/Leaderboard').then((m) => ({ default: m.Leaderboard })))
const Login = lazy(() => import('@/pages/Login').then((m) => ({ default: m.Login })))
const ReportDetail = lazy(() => import('@/pages/ReportDetail').then((m) => ({ default: m.ReportDetail })))
const Reports = lazy(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })))
const TaskEdit = lazy(() => import('@/pages/TaskEdit').then((m) => ({ default: m.TaskEdit })))
const Tasks = lazy(() => import('@/pages/Tasks').then((m) => ({ default: m.Tasks })))
const TokenUsage = lazy(() => import('@/pages/TokenUsage').then((m) => ({ default: m.TokenUsage })))

export function App() {
  return (
    <Suspense fallback={<div data-id="route-loading" className="grid min-h-screen place-items-center text-[var(--steel)]">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/gyms" replace />} />
            <Route path="/gyms" element={<Gyms />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/gyms/:gymId/tasks" element={<Tasks />} />
            <Route path="/gyms/:gymId/tasks/:taskId/edit" element={<TaskEdit />} />
            <Route path="/models" element={<Navigate to="/admin?tab=models" replace />} />
            <Route path="/batches" element={<Batches />} />
            <Route path="/batches/:id/runs" element={<BatchSnapshotPage />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/:batchId" element={<ReportDetail />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/usage" element={<TokenUsage />} />
            <Route element={<ProtectedRoute adminOnly />}>
              <Route path="/admin" element={<Admin />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
