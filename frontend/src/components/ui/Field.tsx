import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Icon } from './Icon'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: ReactNode
  error?: string
  /** Adds a show/hide toggle for password inputs. */
  revealable?: boolean
  inputClassName?: string
}

export function Field({
  label,
  hint,
  error,
  revealable = false,
  type = 'text',
  inputClassName = '',
  ...input
}: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const [revealed, setRevealed] = useState(false)
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  const control = (
    <input
      id={id}
      type={revealable && revealed ? 'text' : type}
      className={`input ${inputClassName}`}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy || undefined}
      {...input}
    />
  )

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {revealable ? (
        <div className="input-wrap">
          {control}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} size={18} />
          </button>
        </div>
      ) : (
        control
      )}
      {hint && !error && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field-error">
          <Icon name="alert" size={16} style={{ marginTop: 2 }} />
          {error}
        </span>
      )}
    </div>
  )
}
