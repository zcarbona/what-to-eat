import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { initials } from '../../lib/format'
import { useKeyboardAwareness } from '../../hooks/useAsync'
import { Icon, type IconName } from '../ui/Icon'

// Only destinations backed by working backend features.
const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/groups', label: 'Groups', icon: 'users' },
  { to: '/join', label: 'Join', icon: 'ticket' },
  { to: '/profile', label: 'Profile', icon: 'user' },
]

export function AppLayout() {
  const { user } = useAuth()
  useKeyboardAwareness()

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="brand" aria-label="What to Eat — home">
            <span className="brand-mark">
              <Icon name="utensils" size={18} />
            </span>
            What to Eat
          </Link>

          <nav className="desktop-nav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                <Icon name={item.icon} size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {user && (
            <Link to="/profile" className="header-user" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="avatar" aria-hidden="true">
                {initials(user.username)}
              </span>
              <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{user.username}</span>
            </Link>
          )}
        </div>
      </header>

      <main className="app-main" id="main">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            <span className="nav-icon">
              <Icon name={item.icon} size={22} />
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
