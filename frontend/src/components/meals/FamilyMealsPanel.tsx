import { useState, type FormEvent } from 'react'
import { ApiError, api } from '../../lib/api'
import { formatDate, initials } from '../../lib/format'
import { useToast } from '../../lib/toast'
import { useAsync } from '../../hooks/useAsync'
import type {
  FamilyMeal,
  GroupMember,
  ResponsibilityStatus,
  ShoppingResponsibility,
} from '../../types/api'
import { ConfirmDialog, Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { Icon } from '../ui/Icon'
import { EmptyState, ErrorState, FormError, ListSkeleton } from '../ui/States'

interface Props {
  groupId: number
  members: GroupMember[]
  currentUserId: number
  isAdmin: boolean
}

function parseList(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function statusBadgeClass(status: ResponsibilityStatus): string {
  switch (status) {
    case 'completed':
    case 'confirmed':
      return 'badge badge-sage'
    case 'reported':
    case 'rejected':
      return 'badge badge-terracotta'
    default:
      return 'badge badge-mustard'
  }
}

export function FamilyMealsPanel({ groupId, members, currentUserId, isAdmin }: Props) {
  const { notify } = useToast()

  const state = useAsync(
    async () => {
      const [meals, responsibilities] = await Promise.all([
        api.listFamilyMeals(groupId),
        api.listShoppingResponsibilities(groupId),
      ])
      return { meals, responsibilities }
    },
    [groupId],
  )

  // Meal create/edit dialog state
  const [mealModalOpen, setMealModalOpen] = useState(false)
  const [editingMeal, setEditingMeal] = useState<FamilyMeal | null>(null)
  const [mealName, setMealName] = useState('')
  const [mealDesc, setMealDesc] = useState('')
  const [mealIngredients, setMealIngredients] = useState('')
  const [mealInstructions, setMealInstructions] = useState('')
  const [mealBusy, setMealBusy] = useState(false)
  const [mealError, setMealError] = useState<string | null>(null)

  // Delete meal state
  const [deletingMeal, setDeletingMeal] = useState<FamilyMeal | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Shopping assignment modal
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignMealId, setAssignMealId] = useState<number>(0)
  const [assignUserId, setAssignUserId] = useState<number>(currentUserId)
  const [assignDueDate, setAssignDueDate] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  // Report modal
  const [reportingTask, setReportingTask] = useState<ShoppingResponsibility | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  function openNewMeal() {
    setEditingMeal(null)
    setMealName('')
    setMealDesc('')
    setMealIngredients('')
    setMealInstructions('')
    setMealError(null)
    setMealModalOpen(true)
  }

  function openEditMeal(meal: FamilyMeal) {
    setEditingMeal(meal)
    setMealName(meal.name)
    setMealDesc(meal.description ?? '')
    setMealIngredients((meal.ingredients ?? []).join(', '))
    setMealInstructions(meal.instructions ?? '')
    setMealError(null)
    setMealModalOpen(true)
  }

  async function saveMeal(e: FormEvent) {
    e.preventDefault()
    if (mealBusy) return
    const name = mealName.trim()
    const ingredients = parseList(mealIngredients)
    const instructions = mealInstructions.trim()

    if (name.length < 3) {
      setMealError('Meal name must be at least 3 characters.')
      return
    }
    if (ingredients.length === 0) {
      setMealError('Add at least one ingredient (comma-separated).')
      return
    }
    if (instructions.length < 3) {
      setMealError('Add brief preparation notes or instructions.')
      return
    }

    setMealBusy(true)
    setMealError(null)
    try {
      if (editingMeal) {
        await api.updateFamilyMeal(editingMeal.id, {
          name,
          description: mealDesc.trim() || null,
          ingredients,
          instructions,
        })
        notify(`“${name}” updated`)
      } else {
        await api.createFamilyMeal(groupId, {
          name,
          description: mealDesc.trim() || null,
          ingredients,
          instructions,
        })
        notify(`“${name}” added to family meals`)
      }
      setMealModalOpen(false)
      state.reload()
    } catch (err) {
      setMealError(err instanceof ApiError ? err.message : 'Could not save the meal.')
    } finally {
      setMealBusy(false)
    }
  }

  async function confirmDeleteMeal() {
    if (!deletingMeal || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await api.deleteFamilyMeal(deletingMeal.id)
      notify(`“${deletingMeal.name}” removed`)
      setDeletingMeal(null)
      state.reload()
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete the meal.')
    } finally {
      setDeleteBusy(false)
    }
  }

  function openAssignModal(defaultMealId?: number) {
    const firstMeal = defaultMealId ?? state.data?.meals[0]?.id ?? 0
    setAssignMealId(firstMeal)
    setAssignUserId(members[0]?.user_id ?? currentUserId)
    setAssignDueDate('')
    setAssignError(null)
    setAssignOpen(true)
  }

  async function submitAssignShopping(e: FormEvent) {
    e.preventDefault()
    if (assignBusy || !assignMealId || !assignUserId) return
    setAssignBusy(true)
    setAssignError(null)
    try {
      const dueIso = assignDueDate ? new Date(`${assignDueDate}T18:00:00`).toISOString() : null
      await api.createShoppingResponsibility(groupId, {
        meal_id: assignMealId,
        assigned_user_id: assignUserId,
        due_at: dueIso,
      })
      notify('Shopping responsibility assigned')
      setAssignOpen(false)
      state.reload()
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : 'Could not assign shopping task.')
    } finally {
      setAssignBusy(false)
    }
  }

  async function updateTaskStatus(task: ShoppingResponsibility, newStatus: ResponsibilityStatus) {
    try {
      await api.updateShoppingResponsibilityStatus(task.id, newStatus)
      notify(`Task marked as ${newStatus}`)
      state.reload()
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not update task.', 'error')
    }
  }

  async function submitReport(e: FormEvent) {
    e.preventDefault()
    if (!reportingTask || reportBusy) return
    if (reportReason.trim().length < 3) {
      setReportError('Please enter a brief reason (at least 3 characters).')
      return
    }
    setReportBusy(true)
    setReportError(null)
    try {
      await api.reportShoppingResponsibility(reportingTask.id, reportReason.trim())
      notify('Shopping issue reported')
      setReportingTask(null)
      setReportReason('')
      state.reload()
    } catch (err) {
      setReportError(err instanceof ApiError ? err.message : 'Could not submit report.')
    } finally {
      setReportBusy(false)
    }
  }

  if (state.loading && !state.data) {
    return <ListSkeleton rows={3} />
  }

  if (state.error && !state.data) {
    return <ErrorState error={state.error} onRetry={state.reload} />
  }

  const meals = state.data?.meals ?? []
  const responsibilities = state.data?.responsibilities ?? []

  return (
    <div className="grid-2">
      {/* Left column: Family Meals Catalog */}
      <section className="section" aria-labelledby="meals-heading">
        <div className="section-head">
          <div>
            <h2 id="meals-heading">Meal catalog</h2>
            <p className="muted small">Shared recipes and go-to meals for this group</p>
          </div>
          {isAdmin && (
            <button type="button" className="btn btn-primary btn-sm" onClick={openNewMeal}>
              <Icon name="plus" size={16} /> Add meal
            </button>
          )}
        </div>

        {meals.length === 0 ? (
          <EmptyState
            title="No meals in the catalog yet"
            action={
              isAdmin ? (
                <button type="button" className="btn btn-primary" onClick={openNewMeal}>
                  <Icon name="plus" size={18} /> Add first meal
                </button>
              ) : undefined
            }
          >
            {isAdmin
              ? 'Add your family favourites with their ingredients so members can pick meals and shop.'
              : 'Ask a group admin to add meals to the family recipe catalog.'}
          </EmptyState>
        ) : (
          <ul className="list" style={{ display: 'grid', gap: 12 }}>
            {meals.map((meal) => (
              <li key={meal.id} className="card card-pad" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="stack" style={{ gap: 10 }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ fontSize: '1.05rem' }}>{meal.name}</h3>
                      {meal.description && (
                        <p className="muted small" style={{ marginTop: 2 }}>
                          {meal.description}
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => openAssignModal(meal.id)}
                          title="Assign shopping"
                        >
                          <Icon name="shoppingBag" size={16} /> Shop
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost btn-icon"
                          style={{ width: 34, minHeight: 34 }}
                          onClick={() => openEditMeal(meal)}
                          aria-label={`Edit ${meal.name}`}
                        >
                          <Icon name="pencil" size={15} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost btn-icon"
                          style={{ width: 34, minHeight: 34, color: 'var(--terracotta-ink)' }}
                          onClick={() => {
                            setDeleteError(null)
                            setDeletingMeal(meal)
                          }}
                          aria-label={`Delete ${meal.name}`}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  {meal.ingredients && meal.ingredients.length > 0 && (
                    <div className="row wrap" style={{ gap: 6 }}>
                      {meal.ingredients.map((ing, i) => (
                        <span key={i} className="badge">
                          {ing}
                        </span>
                      ))}
                    </div>
                  )}

                  {meal.instructions && (
                    <p className="small" style={{ color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
                      {meal.instructions}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Right column: Shopping Responsibilities */}
      <section className="section" aria-labelledby="shopping-heading">
        <div className="section-head">
          <div>
            <h2 id="shopping-heading">Shopping tasks</h2>
            <p className="muted small">Track who is buying ingredients</p>
          </div>
          {isAdmin && meals.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => openAssignModal()}>
              <Icon name="shoppingBag" size={16} /> Assign
            </button>
          )}
        </div>

        {responsibilities.length === 0 ? (
          <div className="card card-pad">
            <p className="muted small">
              No shopping responsibilities assigned yet.
              {isAdmin && meals.length > 0 && ' Use “Assign” to delegate ingredient shopping to a member.'}
            </p>
          </div>
        ) : (
          <ul className="list card">
            {responsibilities.map((task) => {
              const isMine = task.assigned_user_id === currentUserId
              return (
                <li key={task.id}>
                  <div className="list-item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 10 }}>
                    <div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
                      <div className="row" style={{ gap: 10 }}>
                        <span className="avatar" style={{ width: 34, height: 34, fontSize: '0.8rem' }}>
                          {initials(task.assigned_username)}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600 }}>
                            {task.meal_name}
                          </div>
                          <div className="muted small">
                            Assigned to <strong>{task.assigned_username}</strong>
                            {isMine && ' (you)'}
                            {task.due_at && ` · Due ${formatDate(task.due_at)}`}
                          </div>
                        </div>
                      </div>
                      <span className={statusBadgeClass(task.status)}>{task.status}</span>
                    </div>

                    {task.ingredients.length > 0 && (
                      <div className="row wrap" style={{ gap: 6 }}>
                        {task.ingredients.map((ing, idx) => (
                          <span key={idx} className="badge">
                            {ing}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="row wrap" style={{ gap: 8 }}>
                      {(isMine || isAdmin) && task.status === 'pending' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => updateTaskStatus(task, 'completed')}
                        >
                          <Icon name="check" size={15} /> Mark bought
                        </button>
                      )}
                      {isAdmin && task.status === 'completed' && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => updateTaskStatus(task, 'confirmed')}
                        >
                          <Icon name="check" size={15} /> Confirm
                        </button>
                      )}
                      {task.status === 'pending' && !isMine && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger-outline"
                          onClick={() => {
                            setReportReason('')
                            setReportError(null)
                            setReportingTask(task)
                          }}
                        >
                          <Icon name="flag" size={14} /> Report missed
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Add / Edit Meal Dialog */}
      <Dialog
        open={mealModalOpen}
        onClose={() => setMealModalOpen(false)}
        title={editingMeal ? 'Edit meal' : 'Add family meal'}
        description="List the ingredients so shopping tasks can include them automatically."
        busy={mealBusy}
      >
        <form className="form" onSubmit={saveMeal} noValidate>
          <FormError message={mealError} />
          <Field
            label="Meal name"
            name="meal_name"
            placeholder="e.g. Chicken Kabsa"
            maxLength={100}
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            required
          />
          <Field
            label="Short description (optional)"
            name="meal_description"
            placeholder="e.g. Spiced basmati rice with roasted chicken"
            maxLength={500}
            value={mealDesc}
            onChange={(e) => setMealDesc(e.target.value)}
          />
          <Field
            label="Ingredients (comma-separated)"
            name="meal_ingredients"
            placeholder="e.g. Basmati rice, Whole chicken, Tomatoes, Kabsa spice, Raisins"
            value={mealIngredients}
            onChange={(e) => setMealIngredients(e.target.value)}
            hint="Separate each ingredient with a comma."
            required
          />
          <div className="field">
            <label htmlFor="meal-instructions">Preparation instructions</label>
            <textarea
              id="meal-instructions"
              className="input"
              rows={3}
              placeholder="Sauté onions and spices, simmer chicken, then steam rice in the broth…"
              value={mealInstructions}
              onChange={(e) => setMealInstructions(e.target.value)}
              required
            />
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setMealModalOpen(false)} disabled={mealBusy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={mealBusy} aria-busy={mealBusy}>
              {mealBusy && <span className="spinner" aria-hidden="true" />}
              {editingMeal ? 'Save changes' : 'Add meal'}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Assign Shopping Responsibility Dialog */}
      <Dialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign shopping responsibility"
        description="Choose a meal from the catalog and assign a group member to pick up its ingredients."
        busy={assignBusy}
      >
        <form className="form" onSubmit={submitAssignShopping} noValidate>
          <FormError message={assignError} />
          <div className="field">
            <label htmlFor="assign-meal">Meal</label>
            <select
              id="assign-meal"
              className="input"
              value={assignMealId}
              onChange={(e) => setAssignMealId(Number(e.target.value))}
            >
              {meals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.ingredients.length} ingredients)
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="assign-member">Assign to member</label>
            <select
              id="assign-member"
              className="input"
              value={assignUserId}
              onChange={(e) => setAssignUserId(Number(e.target.value))}
            >
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.username} ({m.role})
                </option>
              ))}
            </select>
          </div>
          <Field
            label="Due date (optional)"
            type="date"
            name="due_date"
            value={assignDueDate}
            onChange={(e) => setAssignDueDate(e.target.value)}
          />
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setAssignOpen(false)} disabled={assignBusy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={assignBusy} aria-busy={assignBusy}>
              {assignBusy && <span className="spinner" aria-hidden="true" />}
              Assign task
            </button>
          </div>
        </form>
      </Dialog>

      {/* Report Shopping Responsibility Dialog */}
      <Dialog
        open={reportingTask !== null}
        onClose={() => setReportingTask(null)}
        title="Report missing ingredients"
        description={
          reportingTask
            ? `Let the group know what happened with the shopping for “${reportingTask.meal_name}”.`
            : undefined
        }
        busy={reportBusy}
      >
        <form className="form" onSubmit={submitReport} noValidate>
          <FormError message={reportError} />
          <Field
            label="What went wrong?"
            name="reason"
            placeholder="e.g. Forgot the spices and tomatoes before 6 PM"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            required
          />
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setReportingTask(null)} disabled={reportBusy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={reportBusy} aria-busy={reportBusy}>
              {reportBusy && <span className="spinner" aria-hidden="true" />}
              Submit report
            </button>
          </div>
        </form>
      </Dialog>

      {/* Delete Meal Confirm Dialog */}
      <ConfirmDialog
        open={deletingMeal !== null}
        title={deletingMeal ? `Remove “${deletingMeal.name}”?` : 'Remove meal?'}
        description="This meal will be removed from the family catalog."
        confirmLabel="Remove meal"
        danger
        busy={deleteBusy}
        error={deleteError}
        onConfirm={confirmDeleteMeal}
        onClose={() => setDeletingMeal(null)}
      />
    </div>
  )
}
