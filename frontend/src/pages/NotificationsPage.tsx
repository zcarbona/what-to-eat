import { Icon } from '../components/ui/Icon'
import { EmptyState, ErrorState, ListSkeleton } from '../components/ui/States'
import { useAsync, useTitle } from '../hooks/useAsync'
import { ApiError, api } from '../lib/api'
import { formatRelativeTime } from '../lib/format'
import { useToast } from '../lib/toast'
import type { AppNotification } from '../types/api'

export function NotificationsPage() {
  useTitle('Notifications')
  const { notify } = useToast()
  const state = useAsync(() => api.listNotifications(), [])

  const unreadCount = (state.data ?? []).filter((n) => !n.is_read).length

  async function markOne(item: AppNotification) {
    if (item.is_read) return
    try {
      const updated = await api.markNotificationRead(item.id)
      state.setData((prev) => prev?.map((n) => (n.id === item.id ? updated : n)))
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not update notification.', 'error')
    }
  }

  async function markAll() {
    try {
      await api.markAllNotificationsRead()
      state.setData((prev) => prev?.map((n) => ({ ...n, is_read: true })))
      notify('All notifications marked as read')
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Could not mark notifications read.', 'error')
    }
  }

  return (
    <div className="page narrow">
      <header className="page-head-row">
        <div className="page-head">
          <h1>Notifications</h1>
          <p className="muted">
            Updates on meal turns, shopping tasks, and group activity.
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="btn btn-sm" onClick={markAll}>
            <Icon name="check" size={16} /> Mark all read
          </button>
        )}
      </header>

      {state.loading && !state.data && <ListSkeleton rows={3} />}
      {state.error && !state.data && <ErrorState error={state.error} onRetry={state.reload} />}
      {state.data && state.data.length === 0 && (
        <EmptyState title="You're all caught up">
          When someone assigns you a meal turn, a shopping task, or updates your group role, it will
          show up here.
        </EmptyState>
      )}
      {state.data && state.data.length > 0 && (
        <ul className="list card" aria-label="Notifications">
          {state.data.map((n) => (
            <li key={n.id}>
              <div
                className="list-item"
                style={{
                  background: n.is_read ? undefined : 'var(--mustard-tint)',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  className={`type-icon ${
                    n.notification_type === 'report'
                      ? 'type-family'
                      : n.notification_type === 'shopping'
                        ? 'type-gathering'
                        : 'type-friends'
                  }`}
                >
                  <Icon
                    name={
                      n.notification_type === 'shopping'
                        ? 'shoppingBag'
                        : n.notification_type === 'decision'
                          ? 'sparkles'
                          : 'bell'
                    }
                    size={18}
                  />
                </span>
                <div className="list-item-main">
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span style={{ fontWeight: n.is_read ? 600 : 700 }}>{n.title}</span>
                    {!n.is_read && <span className="badge badge-sage">New</span>}
                  </div>
                  <p className="small" style={{ marginTop: 2 }}>
                    {n.message}
                  </p>
                  <span className="muted small">{formatRelativeTime(n.created_at)}</span>
                </div>
                {!n.is_read && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => markOne(n)}
                  >
                    Mark read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
