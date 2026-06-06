import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute({ adminOnly = false }: { adminOnly?: boolean }) {
  const { isAdmin, isAuthenticated, loading } = useAuth()

  if (loading) {
    return <div data-id="auth-loading" className="p-8 text-sm text-[var(--steel)]">Loading session...</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !isAdmin) {
    return <div data-id="access-denied" className="p-8 text-sm text-[var(--brand-error)]">Access denied.</div>
  }

  return <Outlet />
}
