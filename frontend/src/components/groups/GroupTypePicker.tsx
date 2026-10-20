import { GROUP_TYPES } from '../../lib/format'
import type { GroupType } from '../../types/api'
import { GroupTypeIcon } from './GroupList'

export function GroupTypePicker({
  value,
  onChange,
  name = 'group_type',
}: {
  value: GroupType
  onChange: (t: GroupType) => void
  name?: string
}) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ marginBottom: 6 }}>Type</legend>
      <div className="choice-grid">
        {GROUP_TYPES.map((t) => (
          <label key={t.value} className="choice">
            <input
              type="radio"
              name={name}
              value={t.value}
              checked={value === t.value}
              onChange={() => onChange(t.value)}
            />
            <GroupTypeIcon type={t.value} size={20} />
            <span>
              <span className="choice-title">{t.label}</span>
              <span className="muted small" style={{ display: 'block' }}>
                {t.hint}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
