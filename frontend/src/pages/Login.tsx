import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
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
    <main data-id="login-page" className="harness-login-wrap grid min-h-screen place-items-center p-6">
      <div data-id="login-card" className="harness-card-base w-full max-w-[400px] p-8 shadow-[var(--shadow-card)]">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-green)] text-sm font-bold text-[var(--on-accent)]">H</div>
          <span className="text-[17px] font-bold tracking-tight">Harness<span className="text-[var(--brand-green-deep)]">Studio</span></span>
        </div>
        <h1 className="harness-heading-4 mb-1">Sign in</h1>
        <p className="harness-subtitle mb-5">Evaluate vision-language &amp; computer-use agents.</p>
        <form data-id="login-form" className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-1.5">
            <span className="harness-caption-bold">Email</span>
            <input data-id="login-email" className="harness-input" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="grid gap-1.5">
            <span className="harness-caption-bold">Password</span>
            <input data-id="login-password" type="password" className="harness-input" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p data-id="login-error" className="harness-body-sm text-[var(--brand-error)]">{error}</p> : null}
          <Button data-id="login-submit" type="submit" className="w-full">Sign in</Button>
        </form>
        <p className="harness-caption mt-5 text-center">Self-hosted &middot; AGPL-3.0</p>
      </div>
    </main>
  )
}
