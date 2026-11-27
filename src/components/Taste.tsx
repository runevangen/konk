import { useState } from 'react'
import { TASTE_TAGS, toggleTag } from '../lib/validation'

/** Hurtigvalg for smak: trykk på det som passer. Valgt er styrt av state, ikke av :checked, så markeringen aldri kan bli feil. */
export function TagPicker({ value, onChange, disabled = false, name }: { value: readonly string[]; onChange: (next: string[]) => void; disabled?: boolean; name: string }) {
  return (
    <div className="tag-picker" role="group" aria-label="Smak">
      {TASTE_TAGS.map((t) => {
        const on = value.includes(t)
        return (
          <button key={t} type="button" disabled={disabled} className={`tag ${on ? 'on' : ''}`} aria-pressed={on} data-testid={`tag-${name}-${t}`}
            onClick={() => onChange(toggleTag(value, t))}>{t}</button>
        )
      })}
    </div>
  )
}

/** Kommentarfelt som er lukket til du trenger det (og åpent når det alt står noe der). */
export function CommentField({ id, value, onChange, onBlur, maxLength, disabled = false, counter = false }: {
  id: string; value: string; onChange: (v: string) => void; onBlur?: () => void; maxLength: number; disabled?: boolean; counter?: boolean
}) {
  const [open, setOpen] = useState(false)
  const shown = open || value.length > 0
  if (!shown) {
    return <button type="button" className="btn ghost small" disabled={disabled} onClick={() => setOpen(true)} data-testid="legg-til-kommentar">＋ Kommentar</button>
  }
  return (
    <div>
      <label className="field" htmlFor={id}>Kommentar <span className="soft">(valgfri)</span></label>
      <textarea id={id} value={value} maxLength={maxLength} disabled={disabled} placeholder="Hva smakte du?" autoFocus={open && value.length === 0}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      {counter && <p className="soft small" style={{ margin: '2px 0 0' }}>{value.length}/{maxLength}</p>}
    </div>
  )
}
