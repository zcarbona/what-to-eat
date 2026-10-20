import { Link } from 'react-router-dom'
import { GroupList } from '../components/groups/GroupList'
import { EmptyState, ErrorState, ListSkeleton } from '../components/ui/States'
import { Icon } from '../components/ui/Icon'
import { useAsync, useTitle } from '../hooks/useAsync'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { greeting } from '../lib/format'

const PREVIEW_COUNT = 4

export function HomePage() {
  useTitle('Home')
  const { user } = useAuth()
  const groups = useAsync(() => api.listGroups(), [])

  return (
    <div className="page">
      <header className="page-head">
        <p className="muted">{greeting()},</p>
        <h1>{user?.username}</h1>
      </header>

      <section className="section" aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="visually-hidden">
          Quick actions
        </h2>
        <div className="actions-grid">
          <Link to="/groups/new" className="card action-tile" id="home-create-group">
            <span className="type-icon type-friends">
              <Icon name="plus" />
            </span>
            <span>
              <strong>Create a group</strong>
              <span className="muted small">Family, friends or a gathering</span>
            </span>
          </Link>
          <Link to="/join" className="card action-tile" id="home-join-group">
            <span className="type-icon type-gathering">
              <Icon name="ticket" />
            </span>
            <span>
              <strong>Join with a code</strong>
              <span className="muted small">Use an invite from a group admin</span>
            </span>
          </Link>
        </div>
      </section>

      <section className="section" aria-labelledby="your-groups">
        <div className="section-head">
          <h2 id="your-groups">Your groups</h2>
          {groups.data && groups.data.length > PREVIEW_COUNT && (
            <Link to="/groups" className="btn btn-ghost btn-sm">
              See all {groups.data.length}
            </Link>
          )}
        </div>

        {groups.loading && !groups.data && <ListSkeleton rows={2} />}
        {groups.error && <ErrorState error={groups.error} onRetry={groups.reload} />}
        {groups.data && groups.data.length === 0 && (
          <EmptyState
            showIllustration
            title="No groups yet"
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <Link to="/groups/new" className="btn btn-primary">
                  <Icon name="plus" size={18} /> Create a group
                </Link>
                <Link to="/join" className="btn">
                  Join with a code
                </Link>
              </div>
            }
          >
            Create a group for the people you eat with, or join one with an invite code.
          </EmptyState>
        )}
        {groups.data && groups.data.length > 0 && (
          <GroupList groups={groups.data.slice(0, PREVIEW_COUNT)} />
        )}
      </section>
    </div>
  )
}
