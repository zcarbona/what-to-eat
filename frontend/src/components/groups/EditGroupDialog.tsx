import { useState, type FormEvent } from 'react'
import { ApiError, api } from '../../lib/api'
import { useToast } from '../../lib/toast'
import type { Group, GroupType } from '../../types/api'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { FormError } from '../ui/States'
import { GroupTypePicker } from './GroupTypePicker'

interface Props {
  group: Group
  open: boolean
  onClose: () => void
  onSaved: (group: Group) => void
}

/** PATCH /groups/{id} — admin only. Sends only changed fields. */
export function EditGroupDialog({ group, open, onClose, onSaved }: Props) {
  const { notify } = useToast()
  const [name, setName] = useState(group.name)
  const [type, setType] = useState<GroupType>(group.group_type)
  const [nameError, setNameError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (trimmed.length < 3 || trimmed.length > 100) {
      setNameError('Use 3–100 characters.')
      return
    }
    const payload: { name?: string; group_type?: GroupType } = {}
    if (trimmed !== group.name) payload.name = trimmed
    if (type !== group.group_type) payload.group_type = type
    if (!payload.name && !payload.group_type) {
      onClose()
      return
    }
    setNameError(undefined)
    setError(null)
    setBusy(true)
    try {
      const updated = await api.updateGroup(group.id, payload)
      notify('Group updated')
      onSaved(updated)
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null
      setNameError(apiErr?.fieldErrors.name)
      setError(apiErr?.message ?? 'Could not update the group.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Edit group" busy={busy}>
      <form className="form" onSubmit={onSubmit} noValidate>
        <FormError message={error} />
        <Field
          label="Group name"
          name="name"
          maxLength={100}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
        />
        <GroupTypePicker value={type} onChange={setType} name="edit_group_type" />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            Save changes
          </button>
        </div>
      </form>
    </Dialog>
  )
}
