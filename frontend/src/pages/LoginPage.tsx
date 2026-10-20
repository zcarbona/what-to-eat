import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Field } from '../components/ui/Field'
import { FormError } from '../components/ui/States'
import { Icon } from '../components/ui/Icon'
import { useTitle } from '../hooks/useAsync'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  useTitle('Sign in')
  const { login, sessionExpired } = useAuth()
  const location = useLocation()
  const registeredEmail = (location.state as { email?: string } | null)?.email ?? ''

  const [email, setEmail] = useState(registeredEmail)
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return

    const next: typeof errors = {}
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter the email address you signed up with.'
    if (!password) next.password = 'Enter your password.'
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return

    setSubmitting(true)
    try {
      await login(email.trim(), password)
      // PublicOnly redirects to the original destination once authenticated.
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <header>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to see your groups and plan what to eat.</p>
      </header>

      {sessionExpired && !formError && (
        <div className="alert alert-info" role="status">
          <Icon name="clock" size={18} />
          <span>Your session expired. Please sign in again.</span>
        </div>
      )}

      <form className="form" onSubmit={onSubmit} noValidate>
        <FormError message={formError} />
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          revealable
          required
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting} aria-busy={submitting}>
          {submitting && <span className="spinner" aria-hidden="true" />}
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="muted" style={{ textAlign: 'center' }}>
        New here? <Link to="/register" state={location.state}>Create an account</Link>
      </p>
    </AuthLayout>
  )
}
