import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Field } from '../components/ui/Field'
import { Icon } from '../components/ui/Icon'
import { useTitle } from '../hooks/useAsync'
import { ApiError, api } from '../lib/api'
import { useToast } from '../lib/toast'

const CODE_RE = /^[A-Z0-9]+$/

/** Friendly copy for the error statuses POST /groups/{id}/join can return. */
function explain(err: ApiError): { message: string; alreadyMember?: boolean } {
  switch (err.status) {
    case 409:
      return { message: err.message, alreadyMember: true }
    case 410:
      return { message: `${err.message} Ask a group admin for a new code.` }
    case 404:
      return { message: `${err.message} Check the group ID and code and try again.` }
    default:
      return { message: err.message }
  }
}

export function JoinGroupPage() {
  useTitle('Join a group')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { notify } = useToast()

  const [groupId, setGroupId] = useState(params.get('group') ?? '')
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase())
  const [errors, setErrors] = useState<{ groupId?: string; code?: string }>({})
  const [result, setResult] = useState<{ message: string; alreadyMember?: boolean } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const id = Number(groupId)
    const normalized = code.trim().toUpperCase()
    const next: typeof errors = {}
    if (!Number.isInteger(id) || id <= 0) next.groupId = 'Enter the group ID number you were given.'
    if (!normalized) next.code = 'Enter the invite code.'
    else if (!CODE_RE.test(normalized)) next.code = 'Codes use only letters A–Z and numbers.'
    setErrors(next)
    setResult(null)
    if (Object.keys(next).length) return

    setSubmitting(true)
    try {
      await api.joinGroup(id, normalized)
      notify('Welcome! You joined the group.')
      navigate(`/groups/${id}`, { replace: true })
    } catch (err) {
      setResult(err instanceof ApiError ? explain(err) : { message: 'Could not join the group.' })
      setSubmitting(false)
    }
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Join a group</h1>
        <p className="muted">
          Enter the group ID and invite code a group admin shared with you. Codes work once and
          expire after 5 minutes.
        </p>
      </header>

      <form className="card card-pad form" onSubmit={onSubmit} noValidate>
        {result && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={18} />
            <span>
              {result.message}{' '}
              {result.alreadyMember && <Link to={`/groups/${Number(groupId)}`}>Open the group</Link>}
            </span>
          </div>
        )}
        <Field
          label="Group ID"
          name="group"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value.replace(/\D/g, ''))}
          error={errors.groupId}
          required
        />
        <Field
          label="Invite code"
          name="code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={16}
          inputClassName="input-code"
          placeholder="ABCD1234"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
          error={errors.code}
          required
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting} aria-busy={submitting} id="join-submit">
          {submitting && <span className="spinner" aria-hidden="true" />}
          {submitting ? 'Joining…' : 'Join group'}
        </button>
      </form>
    </div>
  )
}
