import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import { Field } from '../components/ui/Field'
import { Icon } from '../components/ui/Icon'
import { BackLink, EmptyState, ErrorState, FormError, ListSkeleton } from '../components/ui/States'
import { useAsync, useTitle } from '../hooks/useAsync'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDateTime, initials, mealTypeLabel } from '../lib/format'
import { useToast } from '../lib/toast'
import type { MealType } from '../types/api'

function splitTags(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16)
}

export function GatheringDetailPage() {
  const { groupId: rawGroup, eventId: rawEvent } = useParams()
  const groupId = Number(rawGroup)
  const eventId = Number(rawEvent)
  const valid =
    Number.isInteger(groupId) && groupId > 0 && Number.isInteger(eventId) && eventId > 0

  if (!valid) {
    return (
      <div className="page">
        <BackLink to="/groups">Groups</BackLink>
        <EmptyState
          title="Gathering not found"
          action={
            <Link to="/groups" className="btn">
              Back to groups
            </Link>
          }
        >
          This link doesn't point to a valid gathering event.
        </EmptyState>
      </div>
    )
  }

  return <GatheringDetail key={eventId} groupId={groupId} eventId={eventId} />
}

function GatheringDetail({ groupId, eventId }: { groupId: number; eventId: number }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()

  const state = useAsync(
    async () => {
      const [gathering, members, rsvps, menu] = await Promise.all([
        api.getGathering(eventId),
        api.listMembers(groupId),
        api.listGatheringRsvps(eventId),
        api.listGatheringMenu(eventId),
      ])
      return { gathering, members, rsvps, menu }
    },
    [groupId, eventId],
  )

  useTitle(state.data?.gathering.name ?? 'Gathering')

  // RSVP modal state
  const [rsvpOpen, setRsvpOpen] = useState(false)
  const [allergies, setAllergies] = useState('')
  const [dietary, setDietary] = useState('')
  const [dislikes, setDislikes] = useState('')
  const [notes, setNotes] = useState('')
  const [rsvpBusy, setRsvpBusy] = useState(false)
  const [rsvpError, setRsvpError] = useState<string | null>(null)

  // Menu item form state
  const [dishName, setDishName] = useState('')
  const [dishCategory, setDishCategory] = useState('Main dish')
  const [dishUserId, setDishUserId] = useState<number>(user?.id ?? 0)
  const [dishBusy, setDishBusy] = useState(false)

  // Edit / Delete gathering state (Admin)
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editMealType, setEditMealType] = useState<MealType>('dinner')
  const [editTime, setEditTime] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deleting, setDeleting] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (state.loading && !state.data) {
    return (
      <div className="page" aria-busy="true">
        <BackLink to={`/groups/${groupId}`}>Back to group</BackLink>
        <div className="skeleton" style={{ height: 34, width: '60%' }} />
        <ListSkeleton rows={3} />
      </div>
    )
  }

  if (state.error && !state.data) {
    return (
      <div className="page">
        <BackLink to={`/groups/${groupId}`}>Back to group</BackLink>
        <ErrorState error={state.error} onRetry={state.reload} />
      </div>
    )
  }

  if (!state.data || !user) return null
  const { gathering, members, rsvps, menu } = state.data
  const meMember = members.find((m) => m.user_id === user.id)
  const isAdmin = meMember?.role === 'admin'
  const myRsvp = rsvps.find((r) => r.user_id === user.id)

  // Aggregate unique allergies, dietary restrictions, and dislikes across all attendees
  const allAllergies = Array.from(new Set(rsvps.flatMap((r) => r.allergies)))
  const allDietary = Array.from(new Set(rsvps.flatMap((r) => r.dietary_restrictions)))
  const allDislikes = Array.from(new Set(rsvps.flatMap((r) => r.dislikes)))

  function openRsvpDialog() {
    setAllergies((myRsvp?.allergies ?? []).join(', '))
    setDietary((myRsvp?.dietary_restrictions ?? []).join(', '))
    setDislikes((myRsvp?.dislikes ?? []).join(', '))
    setNotes(myRsvp?.notes ?? '')
    setRsvpError(null)
    setRsvpOpen(true)
  }

  async function onSubmitRsvp(e: FormEvent) {
    e.preventDefault()
    if (rsvpBusy) return
    setRsvpBusy(true)
    setRsvpError(null)
    try {
      await api.submitGatheringRsvp(eventId, {
        allergies: splitTags(allergies),
        dietary_restrictions: splitTags(dietary),
        dislikes: splitTags(dislikes),
        notes: notes.trim() || null,
      })
      notify(myRsvp ? 'RSVP preferences updated' : 'RSVP saved!')
      setRsvpOpen(false)
      state.reload()
    } catch (err) {
      setRsvpError(err instanceof ApiError ? err.message : 'Could not save RSVP.')
    } finally {
      setRsvpBusy(false)
    }
  }

  async function onAddMenuItem(e: FormEvent) {
    e.preventDefault()
    if (dishBusy) return
    const trimmed = dishName.trim()
    if (trimmed.length < 2) {
      notify('Enter a dish or drink name.', 'error')
      return
    }
    setDishBusy(true)
    try {
      await api.addGatheringMenuItem(eventId, {
        name: trimmed,
        category: dishCategory,
        assigned_user_id: dishUserId || null,
      })
      notify(`Added “${trimmed}” to the menu`)
      setDishName('')
      state.reload()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not add menu item.', 'error')
    } finally {
      setDishBusy(false)
    }
  }

  async function onRemoveMenuItem(itemId: number) {
    try {
      await api.deleteGatheringMenuItem(itemId)
      notify('Menu item removed')
      state.reload()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not remove item.', 'error')
    }
  }

  function openEditDialog() {
    setEditName(gathering.name)
    setEditDesc(gathering.description ?? '')
    setEditMealType(gathering.meal_type)
    setEditTime(toLocalDatetimeInput(gathering.gathering_time))
    setEditError(null)
    setEditOpen(true)
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (editBusy) return
    const trimmed = editName.trim()
    if (trimmed.length < 3) {
      setEditError('Name must be at least 3 characters.')
      return
    }
    setEditBusy(true)
    setEditError(null)
    try {
      await api.updateGathering(eventId, {
        name: trimmed,
        description: editDesc.trim() || null,
        meal_type: editMealType,
        gathering_time: new Date(editTime).toISOString(),
      })
      notify('Gathering updated')
      setEditOpen(false)
      state.reload()
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Could not update gathering.')
    } finally {
      setEditBusy(false)
    }
  }

  async function onConfirmDelete() {
    if (deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await api.deleteGathering(eventId)
      notify(`“${gathering.name}” deleted`)
      navigate(`/groups/${groupId}`, { replace: true })
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete gathering.')
      setDeleteBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <BackLink to={`/groups/${groupId}`}>Back to group</BackLink>
        <div className="page-head-row" style={{ alignItems: 'center' }}>
          <div className="row" style={{ minWidth: 0, flex: 1 }}>
            <span className="type-icon type-gathering">
              <Icon name="calendar" size={22} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ overflowWrap: 'anywhere' }}>{gathering.name}</h1>
              <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                <span className="badge badge-mustard">{mealTypeLabel(gathering.meal_type)}</span>
                <span className="badge">
                  <Icon name="clock" size={12} /> {formatDateTime(gathering.gathering_time)}
                </span>
              </div>
            </div>
          </div>

          <div className="row wrap">
            <button type="button" className="btn btn-primary" onClick={openRsvpDialog}>
              <Icon name="check" size={18} /> {myRsvp ? 'Update RSVP' : 'RSVP & Dietary Info'}
            </button>
            {isAdmin && (
              <>
                <button type="button" className="btn" onClick={openEditDialog}>
                  <Icon name="pencil" size={16} /> Edit
                </button>
                <button
                  type="button"
                  className="btn btn-danger-outline"
                  onClick={() => {
                    setDeleteError(null)
                    setDeleting(true)
                  }}
                >
                  <Icon name="trash" size={16} /> Delete
                </button>
              </>
            )}
          </div>
        </div>
        {gathering.description && (
          <p className="muted" style={{ marginTop: 6 }}>
            {gathering.description}
          </p>
        )}
      </div>

      {/* Host Dietary Watchlist Banner */}
      {(allAllergies.length > 0 || allDietary.length > 0 || allDislikes.length > 0) && (
        <section className="card card-pad section" aria-labelledby="dietary-summary-heading">
          <h2 id="dietary-summary-heading">Group dietary summary</h2>
          <p className="muted small">
            Combined food notes from {rsvps.length}{' '}
            {rsvps.length === 1 ? 'attendee' : 'attendees'} so everyone can eat safely:
          </p>
          <div className="stack" style={{ gap: 10 }}>
            {allAllergies.length > 0 && (
              <div className="row wrap" style={{ gap: 6 }}>
                <strong className="small" style={{ minWidth: 96, color: 'var(--terracotta-ink)' }}>
                  Allergies:
                </strong>
                {allAllergies.map((a) => (
                  <span key={a} className="badge badge-terracotta">
                    {a}
                  </span>
                ))}
              </div>
            )}
            {allDietary.length > 0 && (
              <div className="row wrap" style={{ gap: 6 }}>
                <strong className="small" style={{ minWidth: 96 }}>
                  Dietary needs:
                </strong>
                {allDietary.map((d) => (
                  <span key={d} className="badge badge-sage">
                    {d}
                  </span>
                ))}
              </div>
            )}
            {allDislikes.length > 0 && (
              <div className="row wrap" style={{ gap: 6 }}>
                <strong className="small" style={{ minWidth: 96 }}>
                  Dislikes:
                </strong>
                {allDislikes.map((d) => (
                  <span key={d} className="badge">
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <div className="grid-2">
        {/* Left column: Potluck / Planned Menu */}
        <section className="section" aria-labelledby="menu-heading">
          <div className="section-head">
            <div>
              <h2 id="menu-heading">Planned menu & potluck</h2>
              <p className="muted small">Dishes, sides, and drinks for this gathering</p>
            </div>
            <span className="muted small">{menu.length} items</span>
          </div>

          <form
            className="card card-pad form"
            onSubmit={onAddMenuItem}
            style={{ gap: 12 }}
            noValidate
          >
            <div className="row wrap" style={{ gap: 10 }}>
              <div style={{ flex: '2 1 180px' }}>
                <Field
                  label="Add a dish or drink"
                  name="dish_name"
                  placeholder="e.g. Hummus platter, Grilled lamb, Mint lemonade"
                  value={dishName}
                  onChange={(e) => setDishName(e.target.value)}
                />
              </div>
              <div className="field" style={{ flex: '1 1 130px' }}>
                <label htmlFor="dish-category">Category</label>
                <select
                  id="dish-category"
                  className="input"
                  value={dishCategory}
                  onChange={(e) => setDishCategory(e.target.value)}
                >
                  <option value="Main dish">Main dish</option>
                  <option value="Side / Salad">Side / Salad</option>
                  <option value="Appetizer">Appetizer</option>
                  <option value="Dessert">Dessert</option>
                  <option value="Drinks">Drinks</option>
                </select>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 10, justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '1 1 180px' }}>
                <label htmlFor="dish-assignee">Who is bringing it?</label>
                <select
                  id="dish-assignee"
                  className="input"
                  value={dishUserId}
                  onChange={(e) => setDishUserId(Number(e.target.value))}
                >
                  <option value={0}>Unassigned (open)</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.username}
                      {m.user_id === user.id ? ' (you)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ minHeight: 48 }}
                disabled={dishBusy}
              >
                <Icon name="plus" size={18} /> Add to menu
              </button>
            </div>
          </form>

          {menu.length === 0 ? (
            <div className="card card-pad">
              <p className="muted small">
                No dishes added yet. Add what you're cooking or bringing above!
              </p>
            </div>
          ) : (
            <ul className="list card">
              {menu.map((item) => (
                <li key={item.id}>
                  <div className="list-item">
                    <span className="type-icon type-friends">
                      <Icon name="utensils" size={18} />
                    </span>
                    <div className="list-item-main">
                      <div className="row wrap" style={{ gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                        <span className="badge">{item.category}</span>
                      </div>
                      <div className="muted small">
                        {item.assigned_username
                          ? `Brought by ${item.assigned_username}`
                          : 'Up for grabs'}
                      </div>
                    </div>
                    {(isAdmin || item.created_by === user.id) && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon"
                        style={{ color: 'var(--terracotta-ink)' }}
                        onClick={() => onRemoveMenuItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right column: Attendee RSVPs & Dietary Preferences */}
        <section className="section" aria-labelledby="rsvps-heading">
          <div className="section-head">
            <div>
              <h2 id="rsvps-heading">Attendee RSVPs</h2>
              <p className="muted small">
                {rsvps.length} {rsvps.length === 1 ? 'member responded' : 'members responded'}
              </p>
            </div>
            <button type="button" className="btn btn-sm" onClick={openRsvpDialog}>
              {myRsvp ? 'Edit my RSVP' : 'RSVP now'}
            </button>
          </div>

          {rsvps.length === 0 ? (
            <div className="card card-pad">
              <p className="muted small">
                No RSVPs yet. Click “RSVP & Dietary Info” to share your allergies, dietary
                preferences, or food dislikes.
              </p>
            </div>
          ) : (
            <ul className="list card">
              {rsvps.map((r) => (
                <li key={r.id}>
                  <div
                    className="list-item"
                    style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}
                  >
                    <div className="row" style={{ gap: 10 }}>
                      <span
                        className="avatar"
                        style={{ width: 34, height: 34, fontSize: '0.8rem' }}
                      >
                        {initials(r.username || 'Member')}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {r.username || `Member #${r.user_id}`}
                          {r.user_id === user.id && (
                            <span className="muted" style={{ fontWeight: 500 }}>
                              {' '}
                              (you)
                            </span>
                          )}
                        </div>
                        {r.notes && <div className="muted small">“{r.notes}”</div>}
                      </div>
                    </div>

                    <div className="row wrap" style={{ gap: 6 }}>
                      {r.allergies.length === 0 &&
                        r.dietary_restrictions.length === 0 &&
                        r.dislikes.length === 0 && (
                          <span className="badge badge-sage">No dietary restrictions</span>
                        )}
                      {r.allergies.map((a) => (
                        <span key={`a-${a}`} className="badge badge-terracotta">
                          Allergy: {a}
                        </span>
                      ))}
                      {r.dietary_restrictions.map((d) => (
                        <span key={`d-${d}`} className="badge badge-sage">
                          {d}
                        </span>
                      ))}
                      {r.dislikes.map((dis) => (
                        <span key={`x-${dis}`} className="badge">
                          Dislikes: {dis}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* RSVP Dialog */}
      <Dialog
        open={rsvpOpen}
        onClose={() => setRsvpOpen(false)}
        title="Your RSVP & dietary preferences"
        description="Separate multiple items with commas (leave blank if none)."
        busy={rsvpBusy}
      >
        <form className="form" onSubmit={onSubmitRsvp} noValidate>
          <FormError message={rsvpError} />
          <Field
            label="Allergies"
            name="allergies"
            placeholder="e.g. Peanuts, Shellfish, Sesame"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            hint="Highlighted in red for the host."
          />
          <Field
            label="Dietary restrictions"
            name="dietary_restrictions"
            placeholder="e.g. Halal, Vegetarian, Gluten-free"
            value={dietary}
            onChange={(e) => setDietary(e.target.value)}
          />
          <Field
            label="Dislikes"
            name="dislikes"
            placeholder="e.g. Cilantro, Olives, Blue cheese"
            value={dislikes}
            onChange={(e) => setDislikes(e.target.value)}
          />
          <Field
            label="Note for the host (optional)"
            name="notes"
            placeholder="e.g. Arriving around 7:15 PM, bringing dessert!"
            maxLength={300}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setRsvpOpen(false)} disabled={rsvpBusy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={rsvpBusy} aria-busy={rsvpBusy}>
              {rsvpBusy && <span className="spinner" aria-hidden="true" />}
              Save RSVP
            </button>
          </div>
        </form>
      </Dialog>

      {/* Edit Gathering Dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit gathering"
        busy={editBusy}
      >
        <form className="form" onSubmit={onSaveEdit} noValidate>
          <FormError message={editError} />
          <Field
            label="Event name"
            name="edit_name"
            maxLength={100}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />
          <div className="field">
            <label htmlFor="edit-meal-type">Meal type</label>
            <select
              id="edit-meal-type"
              className="input"
              value={editMealType}
              onChange={(e) => setEditMealType(e.target.value as MealType)}
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
          </div>
          <Field
            label="Date & time"
            type="datetime-local"
            name="edit_time"
            value={editTime}
            onChange={(e) => setEditTime(e.target.value)}
            required
          />
          <Field
            label="Description"
            name="edit_description"
            maxLength={500}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
          />
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setEditOpen(false)} disabled={editBusy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={editBusy} aria-busy={editBusy}>
              {editBusy && <span className="spinner" aria-hidden="true" />}
              Save changes
            </button>
          </div>
        </form>
      </Dialog>

      {/* Delete Gathering Confirm Dialog */}
      <ConfirmDialog
        open={deleting}
        title={`Delete “${gathering.name}”?`}
        description="All RSVPs and planned menu items for this gathering will be removed."
        confirmLabel="Delete gathering"
        danger
        busy={deleteBusy}
        error={deleteError}
        onConfirm={onConfirmDelete}
        onClose={() => setDeleting(false)}
      />
    </div>
  )
}
