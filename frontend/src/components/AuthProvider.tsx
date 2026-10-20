import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, SESSION_EXPIRED_EVENT, tokenStore } from '../lib/api'
import { AuthContext, type AuthContextValue, type AuthStatus } from '../lib/auth'
import type { RegisterPayload, User } from '../types/api'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    tokenStore.access || tokenStore.refresh ? 'loading' : 'anonymous',
  )
  const [sessionExpired, setSessionExpired] = useState(false)

  // Restore the session on first load.
  useEffect(() => {
    if (status !== 'loading') return
    let cancelled = false
    api
      .me()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        tokenStore.clear()
        setUser(null)
        setStatus('anonymous')
      })
    return () => {
      cancelled = true
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The API client signals when a refresh fails mid-session.
  useEffect(() => {
    const onExpired = () => {
      setUser((prev) => {
        if (prev) setSessionExpired(true)
        return null
      })
      setStatus('anonymous')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api.login(email, password)
    tokenStore.set(tokens)
    try {
      const me = await api.me()
      setUser(me)
      setSessionExpired(false)
      setStatus('authenticated')
    } catch (err) {
      tokenStore.clear()
      throw err
    }
  }, [])

  const register = useCallback(
    async (payload: RegisterPayload) => {
      await api.register(payload)
      await login(payload.email, payload.password)
    },
    [login],
  )

  const logout = useCallback(() => {
    // The backend has no logout/revocation endpoint; discarding the tokens
    // on the client ends the session for this browser.
    tokenStore.clear()
    setUser(null)
    setSessionExpired(false)
    setStatus('anonymous')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, sessionExpired, login, register, logout }),
    [status, user, sessionExpired, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
