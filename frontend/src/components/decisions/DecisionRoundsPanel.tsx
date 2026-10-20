import { useState, type FormEvent } from 'react'
import { ApiError, api } from '../../lib/api'
import { formatDate, formatDateTime, initials } from '../../lib/format'
import { useToast } from '../../lib/toast'
import { useAsync } from '../../hooks/useAsync'
import type {
  DecisionRound,
  FamilyMeal,
  GroupMember,
  GroupType,
} from '../../types/api'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { EmptyState, ErrorState, FormError, ListSkeleton } from '../ui/States'

interface Props {
  groupId: number
  groupType: GroupType
  members: GroupMember[]
  currentUserId: number
  isAdmin: boolean
}

export function DecisionRoundsPanel({
  groupId,
  groupType,
  members,
  currentUserId,
  isAdmin,
}: Props) {
  const { notify } = useToast()

  const state = useAsync(
    async () => {
      const [rounds, meals] = await Promise.all([
        api.listDecisionRounds(groupId),
        api.listFamilyMeals(groupId).catch(() => [] as FamilyMeal[]),
      ])
      return { rounds, meals }
    },
    [groupId],
  )

  // New round modal
  const [createOpen, setCreateOpen] = useState(false)
  const [roundMode, setRoundMode] = useState<'pitch' | 'turn'>(
    groupType === 'family' ? 'turn' : 'pitch',
  )
  const [title, setTitle] = useState('')
  const [scheduledDate, setScheduledDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  )
  const [assignedUserId, setAssignedUserId] = useState<number>(currentUserId)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Submission state per round
  const [pitchFood, setPitchFood] = useState<Record<number, string>>({})
  const [pitchNote, setPitchNote] = useState<Record<number, string>>({})
  const [pitchBusy, setPitchBusy] = useState<number | null>(null)
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [selectedMealByRound, setSelectedMealByRound] = useState<Record<number, number>>({})

  function openNewRound() {
    setRoundMode(groupType === 'family' ? 'turn' : 'pitch')
    setTitle(
      groupType === 'family' ? "Tonight's family meal" : 'What should we eat tonight?',
    )
    setScheduledDate(new Date().toISOString().slice(0, 10))
    setAssignedUserId(members[0]?.user_id ?? currentUserId)
    setCreateError(null)
    setCreateOpen(true)
  }

  async function onCreateRound(e: FormEvent) {
    e.preventDefault()
    if (createBusy) return
    const trimmed = title.trim()
    if (trimmed.length < 2) {
      setCreateError('Give this decision round a short title.')
      return
    }
    setCreateBusy(true)
    setCreateError(null)
    try {
      const isTurn = roundMode === 'turn'
      const deadlineIso =
        isTurn && scheduledDate
          ? new Date(`${scheduledDate}T18:00:00`).toISOString()
          : null
      await api.createDecisionRound(groupId, {
        title: trimmed,
        scheduled_date: isTurn && scheduledDate ? scheduledDate : null,
        assigned_user_id: isTurn ? assignedUserId : null,
        deadline_at: deadlineIso,
      })
      notify(isTurn ? 'Meal turn scheduled' : 'Decision round opened')
      setCreateOpen(false)
      state.reload()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Could not start round.')
    } finally {
      setCreateBusy(false)
    }
  }

  async function onSubmitPitch(e: FormEvent, round: DecisionRound) {
    e.preventDefault()
    if (pitchBusy === round.id) return
    const food = (pitchFood[round.id] ?? '').trim()
    const note = (pitchNote[round.id] ?? '').trim()
    if (food.length < 2) {
      notify('Enter a food or restaurant name (at least 2 characters).', 'error')
      return
    }
    setPitchBusy(round.id)
    try {
      await api.submitFoodIdea(round.id, food, note || undefined)
      notify('Your food pitch is in!')
      setPitchFood((prev) => ({ ...prev, [round.id]: '' }))
      setPitchNote((prev) => ({ ...prev, [round.id]: '' }))
      state.reload()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not submit idea.', 'error')
    } finally {
      setPitchBusy(null)
    }
  }

  async function onResolveRandom(roundId: number) {
    if (resolvingId === roundId) return
    setResolvingId(roundId)
    try {
      const updated = await api.resolveDecisionRound(roundId, { mode: 'random' })
      notify(
        updated.winning_food_name
          ? `Winner: ${updated.winning_food_name}!`
          : 'Decision round resolved!',
      )
      state.reload()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not pick winner.', 'error')
    } finally {
      setResolvingId(null)
    }
  }

  async function onResolvePick(roundId: number, submissionId: number) {
    if (resolvingId === roundId) return
    setResolvingId(roundId)
    try {
      const updated = await api.resolveDecisionRound(roundId, {
        mode: 'pick',
        submission_id: submissionId,
      })
      notify(
        updated.winning_food_name
          ? `Chose “${updated.winning_food_name}”!`
          : 'Decision saved!',
      )
      state.reload()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not select idea.', 'error')
    } finally {
      setResolvingId(null)
    }
  }

  async function onResolveFamilyMeal(roundId: number, mealId: number) {
    if (resolvingId === roundId || !mealId) return
    setResolvingId(roundId)
    try {
      const updated = await api.resolveDecisionRound(roundId, {
        mode: 'meal',
        selected_meal_id: mealId,
      })
      notify(
        updated.selected_meal_name
          ? `Selected “${updated.selected_meal_name}” for the family!`
          : 'Family meal selected!',
      )
      state.reload()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not select meal.', 'error')
    } finally {
      setResolvingId(null)
    }
  }

  async function onCancelRound(roundId: number) {
    try {
      await api.cancelDecisionRound(roundId)
      notify('Decision round cancelled')
      state.reload()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not cancel round.', 'error')
    }
  }

  if (state.loading && !state.data) {
    return <ListSkeleton rows={2} />
  }

  if (state.error && !state.data) {
    return <ErrorState error={state.error} onRetry={state.reload} />
  }

  const rounds = state.data?.rounds ?? []
  const meals = state.data?.meals ?? []
  const openRounds = rounds.filter((r) => r.status === 'OPEN')
  const pastRounds = rounds.filter((r) => r.status !== 'OPEN')

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Food decisions</h2>
          <p className="muted small">
            Pitch ideas and draw a winner, or assign a member’s turn to pick the meal.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openNewRound} id="new-decision-round">
          <Icon name="sparkles" size={18} /> New decision
        </button>
      </div>

      {rounds.length === 0 && (
        <EmptyState
          showIllustration
          title="No food decisions yet"
          action={
            <button type="button" className="btn btn-primary" onClick={openNewRound}>
              <Icon name="sparkles" size={18} /> Start a food decision
            </button>
          }
        >
          Open a round so everyone can pitch what they're craving, or schedule whose turn it is to
          pick tonight's meal.
        </EmptyState>
      )}

      {openRounds.length > 0 && (
        <section className="section" aria-label="Open decision rounds">
          <div style={{ display: 'grid', gap: 16 }}>
            {openRounds.map((round) => {
              const mySubmission = round.submissions.find((s) => s.user_id === currentUserId)
              const isTurnRound = round.assigned_user_id !== null
              const isMyTurn = round.assigned_user_id === currentUserId
              const canResolve =
                isAdmin || round.created_by === currentUserId || isMyTurn
              const chosenMealId =
                selectedMealByRound[round.id] ?? meals[0]?.id ?? 0

              return (
                <div key={round.id} className="card card-pad stack" style={{ gap: 16 }}>
                  <div className="row wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div className="row wrap" style={{ gap: 8 }}>
                        <span className="badge badge-sage">Open</span>
                        {round.scheduled_date && (
                          <span className="badge">
                            <Icon name="calendar" size={12} /> {formatDate(round.scheduled_date)}
                          </span>
                        )}
                        {round.assigned_username && (
                          <span className="badge badge-mustard">
                            Turn: {round.assigned_username}
                            {isMyTurn ? ' (you!)' : ''}
                          </span>
                        )}
                      </div>
                      <h3 style={{ fontSize: '1.15rem', marginTop: 6 }}>
                        {round.title || 'Food decision'}
                      </h3>
                      {round.deadline_at && (
                        <p className="muted small">
                          Deadline: {formatDateTime(round.deadline_at)}
                        </p>
                      )}
                    </div>

                    {(isAdmin || round.created_by === currentUserId) && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onCancelRound(round.id)}
                      >
                        Cancel round
                      </button>
                    )}
                  </div>

                  {/* Turn-based Family Meal Picker when meals exist */}
                  {isTurnRound && meals.length > 0 && (isMyTurn || isAdmin) && (
                    <div
                      className="card card-pad"
                      style={{ background: 'var(--mustard-tint)', borderColor: '#d4c48f' }}
                    >
                      <div className="stack" style={{ gap: 10 }}>
                        <div>
                          <strong>
                            {isMyTurn
                              ? "It's your turn to pick from the family meal catalog!"
                              : `Pick a family meal on behalf of ${round.assigned_username}`}
                          </strong>
                          <p className="muted small">
                            Choose one of the group's saved meals to lock in the plan.
                          </p>
                        </div>
                        <div className="row wrap" style={{ gap: 10 }}>
                          <select
                            className="input"
                            style={{ flex: 1, minWidth: 200 }}
                            value={chosenMealId}
                            onChange={(e) =>
                              setSelectedMealByRound((prev) => ({
                                ...prev,
                                [round.id]: Number(e.target.value),
                              }))
                            }
                            aria-label="Choose family meal"
                          >
                            {meals.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={resolvingId === round.id}
                            onClick={() => onResolveFamilyMeal(round.id, chosenMealId)}
                          >
                            <Icon name="check" size={18} /> Lock in meal
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submissions list */}
                  <div className="section" style={{ gap: 8 }}>
                    <div className="section-head">
                      <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                        Submitted food ideas ({round.submissions.length})
                      </span>
                      {round.submissions.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={resolvingId === round.id}
                          onClick={() => onResolveRandom(round.id)}
                        >
                          <Icon name="sparkles" size={16} /> Pick random winner
                        </button>
                      )}
                    </div>

                    {round.submissions.length === 0 ? (
                      <p className="muted small">
                        No ideas pitched yet. Be the first to suggest something below!
                      </p>
                    ) : (
                      <ul className="list card" style={{ background: 'var(--ivory)' }}>
                        {round.submissions.map((sub) => (
                          <li key={sub.id}>
                            <div className="list-item" style={{ minHeight: 54, padding: '10px 14px' }}>
                              <span
                                className="avatar"
                                style={{ width: 32, height: 32, fontSize: '0.78rem' }}
                              >
                                {initials(sub.username)}
                              </span>
                              <div className="list-item-main">
                                <div style={{ fontWeight: 600 }}>{sub.food_name}</div>
                                <div className="muted small">
                                  Pitched by {sub.username}
                                  {sub.note ? ` · “${sub.note}”` : ''}
                                </div>
                              </div>
                              {canResolve && (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  disabled={resolvingId === round.id}
                                  onClick={() => onResolvePick(round.id, sub.id)}
                                >
                                  Choose this
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Pitch form */}
                  <form
                    onSubmit={(e) => onSubmitPitch(e, round)}
                    className="row wrap"
                    style={{ gap: 10, alignItems: 'flex-end' }}
                  >
                    <div style={{ flex: '1 1 200px' }}>
                      <Field
                        label={mySubmission ? 'Update your food idea' : 'Your food idea'}
                        name={`food_${round.id}`}
                        placeholder={
                          mySubmission
                            ? `Current: ${mySubmission.food_name}`
                            : 'e.g. Neapolitan pizza, Thai curry, Shawarma…'
                        }
                        value={pitchFood[round.id] ?? ''}
                        onChange={(e) =>
                          setPitchFood((prev) => ({ ...prev, [round.id]: e.target.value }))
                        }
                      />
                    </div>
                    <div style={{ flex: '1 1 160px' }}>
                      <Field
                        label="Note (optional)"
                        name={`note_${round.id}`}
                        placeholder="e.g. 2-for-1 tonight"
                        value={pitchNote[round.id] ?? ''}
                        onChange={(e) =>
                          setPitchNote((prev) => ({ ...prev, [round.id]: e.target.value }))
                        }
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn"
                      style={{ minHeight: 48 }}
                      disabled={pitchBusy === round.id}
                    >
                      <Icon name="plus" size={18} />
                      {mySubmission ? 'Update pitch' : 'Submit idea'}
                    </button>
                  </form>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Past / Completed Rounds */}
      {pastRounds.length > 0 && (
        <section className="section" aria-labelledby="past-decisions-heading">
          <h3 id="past-decisions-heading" className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Decided & past rounds
          </h3>
          <ul className="list card">
            {pastRounds.map((round) => (
              <li key={round.id}>
                <div className="list-item" style={{ flexWrap: 'wrap', gap: 12 }}>
                  <span
                    className={`type-icon ${
                      round.status === 'COMPLETED' ? 'type-gathering' : 'type-family'
                    }`}
                  >
                    <Icon
                      name={round.status === 'COMPLETED' ? 'sparkles' : 'x'}
                      size={20}
                    />
                  </span>
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {round.winning_food_name
                        ? `Winner: ${round.winning_food_name}`
                        : round.title || 'Decision round'}
                    </div>
                    <div className="muted small">
                      {round.title}
                      {round.winning_username && ` · Chosen from ${round.winning_username}'s pick`}
                      {round.scheduled_date && ` · For ${formatDate(round.scheduled_date)}`}
                      {round.decided_at && ` · Decided ${formatDate(round.decided_at)}`}
                    </div>
                  </div>
                  <span
                    className={`badge ${
                      round.status === 'COMPLETED' ? 'badge-sage' : ''
                    }`}
                  >
                    {round.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Create Decision Round Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New food decision"
        description="Start a quick group vote/random draw, or assign a member's turn to pick the meal."
        busy={createBusy}
      >
        <form className="form" onSubmit={onCreateRound} noValidate>
          <FormError message={createError} />

          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ marginBottom: 6 }}>Decision style</legend>
            <div className="actions-grid">
              <label className="choice">
                <input
                  type="radio"
                  name="round_mode"
                  checked={roundMode === 'pitch'}
                  onChange={() => setRoundMode('pitch')}
                />
                <span>
                  <span className="choice-title">Pitch & spin</span>
                  <span className="muted small" style={{ display: 'block' }}>
                    Everyone pitches ideas, then draw or pick a winner
                  </span>
                </span>
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="round_mode"
                  checked={roundMode === 'turn'}
                  onChange={() => setRoundMode('turn')}
                />
                <span>
                  <span className="choice-title">Member's turn</span>
                  <span className="muted small" style={{ display: 'block' }}>
                    Assign a member to choose the meal for a date
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <Field
            label="Title"
            name="title"
            placeholder="e.g. Friday dinner vote"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          {roundMode === 'turn' && (
            <>
              <Field
                label="Meal date"
                type="date"
                name="scheduled_date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
              <div className="field">
                <label htmlFor="round-assignee">Whose turn is it?</label>
                <select
                  id="round-assignee"
                  className="input"
                  value={assignedUserId}
                  onChange={(e) => setAssignedUserId(Number(e.target.value))}
                >
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.username} ({m.role})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="dialog-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setCreateOpen(false)}
              disabled={createBusy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createBusy}
              aria-busy={createBusy}
            >
              {createBusy && <span className="spinner" aria-hidden="true" />}
              Start decision
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
