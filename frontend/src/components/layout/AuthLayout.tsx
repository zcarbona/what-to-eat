import type { ReactNode } from 'react'
import illustration from '../../assets/shared-table.webp'

/** Split layout for login/register: illustration on top (phones) or left (desktop). */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-art">
        <img src={illustration} alt="" />
        <p className="auth-tagline">Decide what to eat together — with your family, friends and guests.</p>
      </div>
      <main className="auth-panel">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  )
}
