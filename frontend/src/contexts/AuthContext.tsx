/* eslint-disable react-refresh/only-export-components */
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'

import { authApi, LoginResponse, tokenStore, User } from '@/lib/api'

type AuthContextValue = {
  user: User | null
  isAuthenticated: boolean
  isAdmin: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(tokenStore.getAccessToken()))

  useEffect(() => {
    let cancelled = false

    async function loadUser() {
      if (!tokenStore.getAccessToken()) return
      try {
        const current = await authApi.me()
        if (!cancelled) setUser(current)
      } catch {
        tokenStore.clear()
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadUser()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      loading,
      login: async (email: string, password: string) => {
        const response: LoginResponse = await authApi.login(email, password)
        tokenStore.setTokens(response)
        setUser(response.user)
      },
      logout: async () => {
        const refreshToken = tokenStore.getRefreshToken()
        if (refreshToken) {
          try {
            await authApi.logout(refreshToken)
          } catch {
            // Local logout should continue even if the token is already invalid.
          }
        }
        tokenStore.clear()
        setUser(null)
      },
    }),
    [loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
