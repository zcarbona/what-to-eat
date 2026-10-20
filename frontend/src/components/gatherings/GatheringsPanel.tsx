import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { formatDateTime, mealTypeLabel } from '../../lib/format'
import { useToast } from '../../lib/toast'
import { useAsync } from '../../hooks/useAsync'
import type { MealType } from '../../types/api'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { EmptyState, ErrorState, FormError, ListSkeleton } from '../ui/States'

interface Props {
  groupId: number
  isAdmin: boolean
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner']

function defaultGatheringDateTime(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  d.setHours(19, 0, 0, 0)
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
}

export function GatheringsPanel({ groupId, isAdmin }: Props) {
  const { notify } = useToast()
  const gatherings = useAsync(() => api.listGatherings(groupId), [groupId])

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mealType, setMealType] = useState<MealType>('dinner')
  const [when, setWhen] = useState(defaultGatheringDateTime)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setName('')
    setDescription('')
    setMealType('dinner')
    setWhen(defaultGatheringDateTime())
    setError(null)
    setOpen(true)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (trimmed.length < 3) {
      setError('Give the gathering a name (3–100 characters).')
      return
    }
    if (!when) {
      setError('Choose a date and time for the gathering.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const isoTime = new Date(when).toISOString()
      const created = await api.createGathering({
        group_id: groupId,
        name: trimmed,
        description: description.trim() || null,
        meal_type: mealType,
        gathering_time: isoTime,
      })
      notify(`“${created.name}” scheduled`)
      setOpen(false)
      gatherings.reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create gathering.')
    } finally {
      setBusy(false)
    }
  }

  if (gatherings.loading && !gatherings.data) {
    return <ListSkeleton rows={2} />
  }

  if (gatherings.error && !gatherings.data) {
    return <ErrorState error={gatherings.error} onRetry={gatherings.reload} />
  }

  const list = gatherings.data ?? []

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Gatherings & events</h2>
          <p className="muted small">
            Plan shared meals, collect guest RSVPs, allergies, and potluck dishes.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreate}
            id="create-gathering-btn"
          >
            <Icon name="calendar" size={18} /> Plan gathering
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          showIllustration
          title="No gatherings scheduled yet"
          action={
            isAdmin ? (
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" size={18} /> Schedule first gathering
              </button>
            ) : undefined
          }
        >
          {isAdmin
            ? 'Schedule a breakfast, lunch, or dinner event so members can RSVP with dietary preferences and sign up to bring dishes.'
            : 'Ask a group admin to schedule the next gathering event.'}
        </EmptyState>
      ) : (
        <ul className="list card">
          {list.map((g) => (
            <li key={g.id}>
              <Link to={`/groups/${groupId}/gatherings/${g.id}`} className="list-item">
                <span className="type-icon type-gathering" aria-hidden="true">
                  <Icon name="calendar" size={20} />
                </span>
                <div className="list-item-main">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="list-item-title">{g.name}</span>
                    <span className="badge badge-mustard">{mealTypeLabel(g.meal_type)}</span>
                  </div>
                  <div className="muted small">
                    {formatDateTime(g.gathering_time)}
                    {g.description ? ` · ${g.description}` : ''}
                  </div>
                </div>
                <Icon name="chevronRight" size={20} style={{ color: 'var(--text-muted)' }} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Schedule a gathering"
        description="Members will be able to RSVP with allergies, dietary needs, and dishes to bring."
        busy={busy}
      >
        <form className="form" onSubmit={onSubmit} noValidate>
          <FormError message={error} />
          <Field
            label="Event name"
            name="name"
            placeholder="e.g. Friday Family Brunch"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ marginBottom: 6 }}>Meal type</legend>
            <div className="choice-grid">
              {MEAL_TYPES.map((mt) => (
                <label key={mt} className="choice" style={{ padding: '10px 12px' }}>
                  <input
                    type="radio"
                    name="meal_type"
                    value={mt}
                    checked={mealType === mt}
                    onChange={() => setMealType(mt)}
                  />
                  <span className="choice-title">{mealTypeLabel(mt)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            label="Date & time"
            type="datetime-local"
            name="gathering_time"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
          />
          <Field
            label="Description / notes (optional)"
            name="description"
            placeholder="e.g. Backyard grill — bring your favourite side dish!"
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              Schedule gathering
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
