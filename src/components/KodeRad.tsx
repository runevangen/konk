import { useState } from 'react'
import { regenCompetitionCode, setCompetitionCode } from '../api/data'
import { errorMessage } from '../api/functions'
import type { Competition } from '../api/types'
import { isCode, normalizeCode } from '../lib/quiz'

/** Romkode og storskjerm for en konkurranse (admin). Koden står bare her og på storskjermen, ikke på forsiden. */
export function KodeRad({ comp, onChanged }: { comp: Pick<Competition, 'id' | 'slug' | 'code'>; onChanged: (code: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function save() {
    setErr(null)
    if (!isCode(input)) { setErr('Koden må være fire bokstaver (A–Z).'); return }
    try {
      const r = await setCompetitionCode(comp.id, input)
      if ('ok' in r) { onChanged(r.code); setEditing(false); setMsg(`Koden er nå ${r.code}.`) }
      else setErr(r.error === 'in_use' ? 'Den koden er i bruk. Velg en annen.' : r.error === 'invalid' ? 'Koden må være fire bokstaver (A–Z).' : 'Fant ikke konkurransen.')
    } catch (e) { setErr(errorMessage(e)) }
  }
  async function random() {
    setErr(null)
    try { const c = await regenCompetitionCode(comp.id); onChanged(c); setEditing(false); setMsg(`Ny kode: ${c}.`) } catch (e) { setErr(errorMessage(e)) }
  }

  if (editing) {
    return (
      <div className="kode-editor" data-testid="kode-editor">
        <label className="field" htmlFor={`kode-${comp.id}`} style={{ margin: 0 }}>Romkode (fire bokstaver)</label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input id={`kode-${comp.id}`} className="pin" value={input} onChange={(e) => setInput(normalizeCode(e.target.value))} maxLength={4} autoCapitalize="characters" autoComplete="off" spellCheck={false}
            style={{ letterSpacing: '.3em', textAlign: 'center', fontWeight: 700, width: '8em' }} />
          <button type="button" className="btn green small" onClick={() => void save()} disabled={!isCode(input)}>Lagre</button>
          <button type="button" className="btn ghost small" onClick={() => void random()}>🎲 Tilfeldig</button>
          <button type="button" className="btn ghost small" onClick={() => { setEditing(false); setErr(null) }}>Avbryt</button>
        </div>
        {err && <p className="error" role="alert" style={{ margin: '6px 0 0' }}>{err}</p>}
      </div>
    )
  }
  return (
    <div className="admin-rad" data-testid="admin-rad">
      <span className="badge" title="Romkode" data-testid="romkode">Kode {comp.code}</span>
      <button type="button" className="btn ghost small" onClick={() => { setEditing(true); setInput(comp.code); setErr(null); setMsg(null) }}>✏️ Endre kode</button>
      <a className="btn ghost small" href={`/k/${comp.slug}/skjerm`} target="_blank" rel="noreferrer" data-testid="storskjerm-lenke">📺 Storskjerm</a>
      {msg && <span className="soft small" role="status">{msg}</span>}
    </div>
  )
}
