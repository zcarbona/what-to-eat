import { Link } from 'react-router-dom'
import type { Group, GroupType } from '../../types/api'
import { formatDate, groupTypeLabel } from '../../lib/format'
import { Icon, type IconName } from '../ui/Icon'

const TYPE_ICON: Record<GroupType, IconName> = {
  family: 'home',
  friends: 'users',
  gathering: 'calendar',
}

export function GroupTypeIcon({ type, size = 22 }: { type: GroupType; size?: number }) {
  return (
    <span className={`type-icon type-${type}`} aria-hidden="true">
      <Icon name={TYPE_ICON[type] ?? 'users'} size={size} />
    </span>
  )
}

export function GroupList({ groups }: { groups: Group[] }) {
  return (
    <ul className="list card">
      {groups.map((g) => (
        <li key={g.id}>
          <Link to={`/groups/${g.id}`} className="list-item">
            <GroupTypeIcon type={g.group_type} />
            <div className="list-item-main">
              <div className="list-item-title">{g.name}</div>
              <div className="muted small">
                {groupTypeLabel(g.group_type)} · since {formatDate(g.created_at)}
              </div>
            </div>
            <Icon name="chevronRight" size={20} style={{ color: 'var(--text-muted)' }} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
