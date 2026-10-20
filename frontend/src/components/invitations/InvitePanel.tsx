import { useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { copyText } from '../../lib/clipboard'
import { formatCountdown, parseServerDate } from '../../lib/format'
import { useToast } from '../../lib/toast'
import { useNow } from '../../hooks/useAsync'
import type { Invitation } from '../../types/api'
import { Icon } from '../ui/Icon'
import { FormError } from '../ui/States'

/**
 * Admin-only invitation codes (POST /groups/{id}/invitations).
 * Backend rules: max 5 active codes per group, each single-use and valid for
 * 5 minutes. The plaintext code is returned only once, so codes are kept only
 * in this component's state for the current visit.
 */
export function InvitePanel({ groupId, groupName }: { groupId: number; groupName: string }) {
  const { notify } = useToast()
  const [codes, setCodes] = useState<Invitation[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = useNow(codes.length > 0)

  async function create() {
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const inv = await api.createInvitation(groupId)
      setCodes((list) => [inv, ...list])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create an invite code.')
    } finally {
      setCreating(false)
    }
  }

  const inviteLink = (code: string) =>
    `${window.location.origin}/join?group=${groupId}&code=${encodeURIComponent(code)}`

  async function copy(text: string, what: string) {
    if (await copyText(text)) notify(`${what} copied`)
    else notify("Couldn't copy. Please copy it manually.", 'error')
  }

  async function share(code: string) {
    const url = inviteLink(code)
    const text = `Join “${groupName}” on What to Eat. Group ID ${groupId}, code ${code}.`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'What to Eat invite', text, url })
      } catch {
        /* user cancelled */
      }
    } else {
      await copy(url, 'Invite link')
    }
  }

  return (
    <section className="card card-pad section" aria-labelledby="invite-heading">
      <div className="section-head">
        <h2 id="invite-heading">Invite people</h2>
        <span className="badge badge-sage">
          <Icon name="shield" size={12} /> Admin
        </span>
      </div>
      <p className="muted small">
        Each code works once and expires after 5 minutes. A group can have up to 5 active codes.
        The code is only shown here, so share it right away.
      </p>

      <FormError message={error} />

      <button type="button" className="btn btn-primary" onClick={create} disabled={creating} aria-busy={creating} id="create-invite">
        {creating ? <span className="spinner" aria-hidden="true" /> : <Icon name="plus" size={18} />}
        {creating ? 'Creating…' : 'Create invite code'}
      </button>

      {codes.length > 0 && (
        <ul className="list" style={{ display: 'grid', gap: 10 }} aria-label="Invite codes created on this visit">
          {codes.map((inv) => {
            const remaining = parseServerDate(inv.expires_at).getTime() - now
            const expired = remaining <= 0
            return (
              <li key={inv.id} style={{ border: 0 }}>
                <div className={`code-box ${expired ? 'expired' : ''}`}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="code-value" aria-label={`Code ${inv.code.split('').join(' ')}`}>
                      {inv.code}
                    </span>
                    <span className="badge" aria-live="off">
                      <Icon name="clock" size={12} />
                      {expired ? 'Expired' : formatCountdown(remaining)}
                    </span>
                  </div>
                  <div className="small">
                    Group ID <strong>{groupId}</strong>
                  </div>
                  {!expired && (
                    <div className="row wrap" style={{ gap: 8 }}>
                      <button type="button" className="btn btn-sm" onClick={() => copy(inv.code, 'Code')}>
                        <Icon name="copy" size={16} /> Copy code
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => share(inv.code)}>
                        <Icon name="share" size={16} /> Share link
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
