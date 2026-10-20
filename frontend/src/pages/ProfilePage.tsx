import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ui/Dialog'
import { Icon } from '../components/ui/Icon'
import { useAsync, useTitle } from '../hooks/useAsync'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate, initials } from '../lib/format'

export function ProfilePage() {
  useTitle('Profile')
  const { user, logout } = useAuth()
  const groups = useAsync(() => api.listGroups(), [])
  const [confirming, setConfirming] = useState(false)

  if (!user) return null

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Profile</h1>
      </header>

      <section className="card card-pad section" aria-label="Account">
        <div className="row">
          <span className="avatar avatar-lg" aria-hidden="true">
            {initials(user.username)}
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: '1.2rem', overflowWrap: 'anywhere' }}>{user.username}</h2>
            <p className="muted small" style={{ overflowWrap: 'anywhere' }}>
              {user.email}
            </p>
          </div>
        </div>
        <dl className="kv" style={{ marginTop: 8 }}>
          <dt>Member since</dt>
          <dd>{formatDate(user.created_at)}</dd>
          <dt>Account</dt>
          <dd>
            <span className={`badge ${user.is_active ? 'badge-sage' : 'badge-terracotta'}`}>
              {user.is_active ? 'Active' : 'Inactive'}
            </span>
          </dd>
          <dt>Groups</dt>
          <dd>
            {groups.loading && !groups.data ? (
              <span className="spinner" style={{ display: 'inline-block', width: 16, height: 16 }} aria-label="Loading" />
            ) : groups.data ? (
              <Link to="/groups">{groups.data.length}</Link>
            ) : (
              <span className="muted">Unavailable</span>
            )}
          </dd>
        </dl>
      </section>

      <button type="button" className="btn btn-danger-outline btn-block" onClick={() => setConfirming(true)} id="logout">
        <Icon name="logout" size={18} /> Sign out
      </button>

      <ConfirmDialog
        open={confirming}
        title="Sign out?"
        description="You'll need your email and password to sign in again on this device."
        confirmLabel="Sign out"
        danger
        onConfirm={logout}
        onClose={() => setConfirming(false)}
      />
    </div>
  )
}
