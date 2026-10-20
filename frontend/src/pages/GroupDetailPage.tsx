import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EditGroupDialog } from '../components/groups/EditGroupDialog'
import { GroupTypeIcon } from '../components/groups/GroupList'
import { MemberList } from '../components/groups/MemberList'
import { InvitePanel } from '../components/invitations/InvitePanel'
import { ConfirmDialog } from '../components/ui/Dialog'
import { Icon } from '../components/ui/Icon'
import { BackLink, EmptyState, ErrorState, ListSkeleton } from '../components/ui/States'
import { useAsync, useTitle } from '../hooks/useAsync'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, groupTypeLabel } from '../lib/format'
import { useToast } from '../lib/toast'

export function GroupDetailPage() {
  const { groupId: raw } = useParams()
  const groupId = Number(raw)
  const valid = Number.isInteger(groupId) && groupId > 0

  if (!valid) {
    return (
      <div className="page">
        <BackLink to="/groups">Groups</BackLink>
        <EmptyState title="Group not found" action={<Link to="/groups" className="btn">Back to groups</Link>}>
          This link doesn't point to a valid group.
        </EmptyState>
      </div>
    )
  }
  return <GroupDetail key={groupId} groupId={groupId} />
}

function GroupDetail({ groupId }: { groupId: number }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()

  const state = useAsync(
    async () => {
      const [group, members] = await Promise.all([api.getGroup(groupId), api.listMembers(groupId)])
      return { group, members }
    },
    [groupId],
  )
  useTitle(state.data?.group.name ?? 'Group')

  const [editing, setEditing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  if (state.loading && !state.data) {
    return (
      <div className="page" aria-busy="true">
        <BackLink to="/groups">Groups</BackLink>
        <div className="skeleton" style={{ height: 34, width: '60%' }} />
        <ListSkeleton rows={3} />
      </div>
    )
  }

  if (state.error && !state.data) {
    const notMember = state.error.status === 403
    const missing = state.error.status === 404
    return (
      <div className="page">
        <BackLink to="/groups">Groups</BackLink>
        {notMember || missing ? (
          <EmptyState
            title={missing ? 'Group not found' : "You're not a member of this group"}
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                {notMember && (
                  <Link to={`/join?group=${groupId}`} className="btn btn-primary">
                    <Icon name="ticket" size={18} /> Join with a code
                  </Link>
                )}
                <Link to="/groups" className="btn">
                  Back to groups
                </Link>
              </div>
            }
          >
            {missing
              ? 'It may have been removed, or the link is wrong.'
              : 'Ask a group admin for an invite code to join.'}
          </EmptyState>
        ) : (
          <ErrorState error={state.error} onRetry={state.reload} />
        )}
      </div>
    )
  }

  if (!state.data || !user) return null
  const { group, members } = state.data
  const me = members.find((m) => m.user_id === user.id)
  const isAdmin = me?.role === 'admin'
  const adminCount = members.filter((m) => m.role === 'admin').length
  const lastAdmin = isAdmin && adminCount <= 1

  async function leave() {
    if (leaveBusy) return
    setLeaveBusy(true)
    setLeaveError(null)
    try {
      await api.leaveGroup(groupId)
      notify(`You left “${group.name}”`)
      navigate('/groups', { replace: true })
    } catch (err) {
      setLeaveError(err instanceof ApiError ? err.message : 'Could not leave the group.')
      setLeaveBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <BackLink to="/groups">Groups</BackLink>
        <div className="page-head-row" style={{ alignItems: 'center' }}>
          <div className="row" style={{ minWidth: 0, flex: 1 }}>
            <GroupTypeIcon type={group.group_type} />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ overflowWrap: 'anywhere' }}>{group.name}</h1>
              <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                <span className="badge">{groupTypeLabel(group.group_type)}</span>
                {isAdmin ? (
                  <span className="badge badge-sage">
                    <Icon name="shield" size={12} /> You're an admin
                  </span>
                ) : (
                  <span className="badge">You're a member</span>
                )}
              </div>
            </div>
          </div>
          {isAdmin && (
            <button type="button" className="btn" onClick={() => setEditing(true)} id="edit-group">
              <Icon name="pencil" size={16} /> Edit
            </button>
          )}
        </div>
      </div>

      <div className="grid-2">
        <section className="section" aria-labelledby="members-heading">
          <div className="section-head">
            <h2 id="members-heading">Members</h2>
            <span className="muted small">
              {members.length} {members.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          <MemberList
            groupId={groupId}
            members={members}
            currentUserId={user.id}
            isAdmin={isAdmin}
            onChanged={state.reload}
          />
        </section>

        <div className="stack">
          {isAdmin && <InvitePanel groupId={groupId} groupName={group.name} />}

          <section className="card card-pad section" aria-labelledby="about-heading">
            <h2 id="about-heading">About</h2>
            <dl className="kv">
              <dt>Group ID</dt>
              <dd>{group.id}</dd>
              <dt>Type</dt>
              <dd>{groupTypeLabel(group.group_type)}</dd>
              <dt>Created</dt>
              <dd>{formatDate(group.created_at)}</dd>
            </dl>
          </section>

          <section className="card card-pad section" aria-labelledby="leave-heading">
            <h2 id="leave-heading">Leave group</h2>
            <p className="muted small">
              {lastAdmin
                ? "You're the only admin. Make someone else an admin before you leave."
                : "You'll lose access until someone invites you again."}
            </p>
            <button
              type="button"
              className="btn btn-danger-outline"
              onClick={() => {
                setLeaveError(null)
                setLeaving(true)
              }}
              id="leave-group"
            >
              <Icon name="logout" size={18} /> Leave group
            </button>
          </section>
        </div>
      </div>

      {isAdmin && (
        <EditGroupDialog
          key={`${group.name}-${group.group_type}-${editing}`}
          group={group}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            state.setData((prev) => (prev ? { ...prev, group: updated } : prev))
            setEditing(false)
          }}
        />
      )}

      <ConfirmDialog
        open={leaving}
        title={`Leave “${group.name}”?`}
        description="You'll need a new invite code to rejoin."
        confirmLabel="Leave group"
        danger
        busy={leaveBusy}
        error={leaveError}
        onConfirm={leave}
        onClose={() => setLeaving(false)}
      />
    </div>
  )
}
