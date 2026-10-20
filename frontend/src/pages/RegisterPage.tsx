import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Field } from '../components/ui/Field'
import { FormError } from '../components/ui/States'
import { useTitle } from '../hooks/useAsync'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Errors = Partial<Record<'username' | 'email' | 'password' | 'confirm', string>>

// Mirrors app/schemas/auth.py UserCreate + validate_password_strength.
function validate(username: string, email: string, password: string, confirm: string): Errors {
  const e: Errors = {}
  const u = username.trim()
  if (u.length < 3 || u.length > 25) e.username = 'Use 3–25 characters.'
  if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address.'
  if (password.length < 8 || password.length > 128) e.password = 'Use 8–128 characters.'
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    e.password = 'Include at least one letter and one number.'
  if (confirm !== password) e.confirm = 'Passwords do not match.'
  return e
}

export function RegisterPage() {
  useTitle('Create account')
  const { register } = useAuth()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const next = validate(username, email, password, confirm)
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return

    setSubmitting(true)
    try {
      await register({ username: username.trim(), email: email.trim(), password })
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors as Errors)
        setFormError(err.message)
      } else {
        setFormError('Could not create your account. Please try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <header>
        <h1>Create your account</h1>
        <p className="muted">Start a group for your family or friends and plan meals together.</p>
      </header>

      <form className="form" onSubmit={onSubmit} noValidate>
        <FormError message={formError} />
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={25}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          hint="This is how other members will see you."
          error={errors.username}
          required
        />
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
          name="new-password"
          autoComplete="new-password"
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters, with a letter and a number."
          error={errors.password}
          revealable
          required
        />
        <Field
          label="Confirm password"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
          revealable
          required
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting} aria-busy={submitting}>
          {submitting && <span className="spinner" aria-hidden="true" />}
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="muted" style={{ textAlign: 'center' }}>
        Already have an account? <Link to="/login" state={location.state}>Sign in</Link>
      </p>
    </AuthLayout>
  )
}
