import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ApiError } from '../../lib/api'
import { Icon } from './Icon'
import illustration from '../../assets/shared-table.webp'

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="row" style={{ gap: 8 }}>
      <span className="spinner" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  )
}

/** Placeholder rows while a list loads. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="list-item" style={{ borderTop: i ? '1px solid var(--border)' : 0 }}>
          <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 14 }} />
          <div style={{ flex: 1, display: 'grid', gap: 8 }}>
            <div className="skeleton" style={{ height: 14, width: '55%' }} />
            <div className="skeleton" style={{ height: 12, width: '30%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  title = "We couldn't load this",
}: {
  error: ApiError
  onRetry?: () => void
  title?: string
}) {
  return (
    <div className="card state" role="alert">
      <span className="type-icon type-family">
        <Icon name="alert" />
      </span>
      <h2>{title}</h2>
      <p className="muted">{error.message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          <Icon name="refresh" size={18} /> Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
  showIllustration = false,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  showIllustration?: boolean
}) {
  return (
    <div className="card state">
      {showIllustration && <img src={illustration} alt="" className="state-illustration" />}
      <h2>{title}</h2>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="alert alert-error" role="alert">
      <Icon name="alert" size={18} />
      <span>{message}</span>
    </div>
  )
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="back-link">
      <Icon name="chevronLeft" size={18} />
      {children}
    </Link>
  )
}
