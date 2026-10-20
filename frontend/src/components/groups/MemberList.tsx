import { useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { initials } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { GroupMember, MemberRole } from '../../types/api'
import { ConfirmDialog } from '../ui/Dialog'
import { Icon } from '../ui/Icon'

interface Props {
  groupId: number
  members: GroupMember[]
  currentUserId: number
  isAdmin: boolean
  onChanged: () => void
}

interface PendingChange {
  member: GroupMember
  role: MemberRole
}

export function MemberList({ groupId, members, currentUserId, isAdmin, onChanged }: Props) {
  const { notify } = useToast()
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!pending || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.updateMemberRole(groupId, pending.member.user_id, pending.role)
      notify(
        pending.role === 'admin'
          ? `${pending.member.username} is now an admin`
          : `${pending.member.username} is now a member`,
      )
      setPending(null)
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the role.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ul className="list card" aria-label="Members">
        {members.map((m) => {
          const isMe = m.user_id === currentUserId
          const target: MemberRole = m.role === 'admin' ? 'member' : 'admin'
          return (
            <li key={m.user_id}>
              <div className="list-item">
                <span className="avatar" aria-hidden="true">
                  {initials(m.username)}
                </span>
                <div className="list-item-main">
                  <div className="list-item-title">
                    {m.username}
                    {isMe && <span className="muted" style={{ fontWeight: 500 }}> (you)</span>}
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 2 }}>
                    {m.role === 'admin' ? (
                      <span className="badge badge-sage">
                        <Icon name="shield" size={12} /> Admin
                      </span>
                    ) : (
                      <span className="badge">Member</span>
                    )}
                  </div>
                </div>
                {isAdmin && !isMe && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      setError(null)
                      setPending({ member: m, role: target })
                    }}
                    aria-label={target === 'admin' ? `Make ${m.username} an admin` : `Make ${m.username} a regular member`}
                  >
                    {target === 'admin' ? 'Make admin' : 'Remove admin'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.role === 'admin' ? 'Make admin?' : 'Remove admin role?'}
        description={
          pending?.role === 'admin'
            ? `${pending.member.username} will be able to rename the group, create invite codes and change roles.`
            : `${pending?.member.username ?? ''} will become a regular member.`
        }
        confirmLabel={pending?.role === 'admin' ? 'Make admin' : 'Remove admin'}
        busy={busy}
        error={error}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </>
  )
}
