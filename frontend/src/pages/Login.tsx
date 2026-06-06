import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'

export function Login() {
  const navigate = useNavigate()
  const { isAuthenticated, login } = useAuth()
  const [email, setEmail] = useState('test@example.com')
  const [password, setPassword] = useState('Test@$1234')
  const [error, setError] = useState('')

  if (isAuthenticated) {
    return <Navigate to="/gyms" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/gyms')
    } catch {
      setError('Invalid credentials.')
    }
  }

  return (
    <main data-id="login-page" className="grid min-h-screen place-items-center bg-[var(--canvas)] p-6 text-[var(--ink)]">
      <Card className="w-full max-w-md p-6">
        <CardHeader>
          <CardTitle>Harness Studio Login</CardTitle>
          <CardDescription>Use the seeded base admin for local Phase 2 verification.</CardDescription>
        </CardHeader>
        <CardContent>
          <form data-id="login-form" className="grid gap-4" onSubmit={handleSubmit}>
            <input data-id="login-email" className="harness-input" value={email} onChange={(event) => setEmail(event.target.value)} />
            <input data-id="login-password" type="password" className="harness-input" value={password} onChange={(event) => setPassword(event.target.value)} />
            {error ? <p data-id="login-error" className="text-sm text-[var(--brand-error)]">{error}</p> : null}
            <Button data-id="login-submit" type="submit">Log in</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
