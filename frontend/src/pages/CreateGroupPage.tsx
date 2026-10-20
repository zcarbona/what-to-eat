import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { GroupTypePicker } from '../components/groups/GroupTypePicker'
import { Field } from '../components/ui/Field'
import { BackLink, FormError } from '../components/ui/States'
import { useTitle } from '../hooks/useAsync'
import { ApiError, api } from '../lib/api'
import { useToast } from '../lib/toast'
import type { GroupType } from '../types/api'

export function CreateGroupPage() {
  useTitle('New group')
  const navigate = useNavigate()
  const { notify } = useToast()

  const [name, setName] = useState('')
  const [type, setType] = useState<GroupType>('family')
  const [nameError, setNameError] = useState<string>()
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const trimmed = name.trim()
    // app/schemas/group.py Creategroup: name 3–100 chars.
    if (trimmed.length < 3 || trimmed.length > 100) {
      setNameError('Use 3–100 characters.')
      return
    }
    setNameError(undefined)
    setFormError(null)
    setSubmitting(true)
    try {
      const group = await api.createGroup({ name: trimmed, group_type: type })
      notify(`“${group.name}” created. You're its admin.`)
      navigate(`/groups/${group.id}`, { replace: true })
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null
      setNameError(apiErr?.fieldErrors.name)
      setFormError(apiErr?.message ?? 'Could not create the group.')
      setSubmitting(false)
    }
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <BackLink to="/groups">Groups</BackLink>
        <h1>New group</h1>
        <p className="muted">You'll be the group's admin and can invite others with a code.</p>
      </div>

      <form className="card card-pad form" onSubmit={onSubmit} noValidate>
        <FormError message={formError} />
        <Field
          label="Group name"
          name="name"
          placeholder="e.g. Sunday dinners"
          maxLength={100}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
          required
        />
        <GroupTypePicker value={type} onChange={setType} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn-primary" disabled={submitting} aria-busy={submitting} id="create-group-submit">
            {submitting && <span className="spinner" aria-hidden="true" />}
            {submitting ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </form>
    </div>
  )
}
