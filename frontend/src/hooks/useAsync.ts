import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'

export interface AsyncState<T> {
  data: T | undefined
  error: ApiError | null
  loading: boolean
  /** Re-run the loader. Keeps current data visible while reloading. */
  reload: () => void
  setData: (updater: (prev: T | undefined) => T | undefined) => void
}

/**
 * Load data from the API with loading/error state and a stale-response guard.
 * Components that load per-entity data should be keyed by that entity's id so
 * a change remounts them with a fresh loading state.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const requestId = useRef(0)

  useEffect(() => {
    const id = ++requestId.current
    loader()
      .then((result) => {
        if (id !== requestId.current) return
        setDataState(result)
        setError(null)
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return
        setError(err instanceof ApiError ? err : new ApiError(0, 'Something went wrong.'))
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    setTick((t) => t + 1)
  }, [])
  const setData = useCallback(
    (updater: (prev: T | undefined) => T | undefined) => setDataState(updater),
    [],
  )

  return { data, error, loading, reload, setData }
}

/** Re-render every `intervalMs` while `active` (used for invite countdowns). */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [active, intervalMs])
  return now
}

/** Sets document.title for the current page. */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · What to Eat` : 'What to Eat — plan food together'
  }, [title])
}

/**
 * Marks <body data-keyboard="open"> while a text field has focus on touch
 * devices, so the fixed bottom navigation can step aside for the keyboard.
 */
export function useKeyboardAwareness() {
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)')
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' &&
          !['checkbox', 'radio', 'button', 'submit'].includes((el as HTMLInputElement).type)))

    const onIn = (e: FocusEvent) => {
      if (coarse.matches && isField(e.target)) document.body.dataset.keyboard = 'open'
    }
    const onOut = () => {
      // Wait a tick: focus may move straight to another field.
      window.setTimeout(() => {
        if (!isField(document.activeElement)) delete document.body.dataset.keyboard
      }, 50)
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
      delete document.body.dataset.keyboard
    }
  }, [])
}
