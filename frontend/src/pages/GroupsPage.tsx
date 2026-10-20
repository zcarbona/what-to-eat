import { Link } from 'react-router-dom'
import { GroupList } from '../components/groups/GroupList'
import { EmptyState, ErrorState, ListSkeleton } from '../components/ui/States'
import { Icon } from '../components/ui/Icon'
import { useAsync, useTitle } from '../hooks/useAsync'
import { api } from '../lib/api'

export function GroupsPage() {
  useTitle('Groups')
  const groups = useAsync(() => api.listGroups(), [])

  return (
    <div className="page">
      <header className="page-head-row">
        <div className="page-head">
          <h1>Groups</h1>
          <p className="muted">Groups you are an active member of.</p>
        </div>
        <div className="row">
          <Link to="/join" className="btn" id="groups-join">
            <Icon name="ticket" size={18} /> Join
          </Link>
          <Link to="/groups/new" className="btn btn-primary" id="groups-create">
            <Icon name="plus" size={18} /> New group
          </Link>
        </div>
      </header>

      {groups.loading && !groups.data && <ListSkeleton rows={3} />}
      {groups.error && <ErrorState error={groups.error} onRetry={groups.reload} />}
      {groups.data && groups.data.length === 0 && (
        <EmptyState
          showIllustration
          title="You're not in any groups yet"
          action={
            <Link to="/groups/new" className="btn btn-primary">
              <Icon name="plus" size={18} /> Create your first group
            </Link>
          }
        >
          Groups bring together the people you share meals with.
        </EmptyState>
      )}
      {groups.data && groups.data.length > 0 && <GroupList groups={groups.data} />}
    </div>
  )
}
