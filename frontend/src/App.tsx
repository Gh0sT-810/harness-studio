import { Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Admin } from '@/pages/Admin'
import { Batches } from '@/pages/Batches'
import { BatchSnapshotPage } from '@/pages/BatchSnapshot'
import { Gyms } from '@/pages/Gyms'
import { Login } from '@/pages/Login'
import { Tasks } from '@/pages/Tasks'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/gyms" replace />} />
          <Route path="/gyms" element={<Gyms />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/gyms/:gymId/tasks" element={<Tasks />} />
          <Route path="/models" element={<Navigate to="/admin?tab=models" replace />} />
          <Route path="/batches" element={<Batches />} />
          <Route path="/batches/:id/runs" element={<BatchSnapshotPage />} />
          <Route element={<ProtectedRoute adminOnly />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
