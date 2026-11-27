import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCompetition, listItems, listMyEntries, listOptions, saveEntry } from '../api/data'
import { errorMessage } from '../api/functions'
import { useAuth } from '../auth'
import { ErrorBox, Loading, StatusBadge } from '../components/ui'
import { useAsync } from '../hooks'
import { diffDrafts, type Draft } from '../lib/mineEdit'
import { COMMENT_MAX, SCORE_MAX, SCORE_MIN } from '../lib/validation'

/** Oversikt over alle egne svar i en konkurranse. «Rediger svar» gjør alle kortene redigerbare på en gang. */
export default function Mine() {
  const { slug = '' } = useParams()
  const { session } = useAuth()
  const uid = session!.user.id
  const { data, error, loading, reload } = useAsync(async () => {
    const comp = await getCompetition(slug)
    if (!comp) return null
    const [items, options] = await Promise.all([listItems(comp.id), listOptions(comp.id)])
    const entries = await listMyEntries(uid, items.map((i) => i.id))
    return { comp, items, options, entries }
  }, [slug, uid])

  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [missing, setMissing] = useState<string[]>([])

  // Utgangspunktet for diffen: det som ligger lagret nå.
  const original = useMemo(() => {
    const o: Record<string, Draft | null> = {}
    if (!data) return o
    const byItem = new Map(data.entries.map((e) => [e.item_id, e]))
    for (const it of data.items) {
      const e = byItem.get(it.id)
      o[it.id] = e ? { score: e.score, guess: e.guess_option_id, comment: e.comment ?? '' } : null
    }
    return o
  }, [data])

  const itemIds = useMemo(() => data?.items.map((i) => i.id) ?? [], [data])
  const diff = useMemo(() => diffDrafts(itemIds, original, drafts), [itemIds, original, drafts])

  // Advar før du forlater siden med ulagrede endringer.
  useEffect(() => {
    if (!editing || diff.changed === 0) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [editing, diff.changed])

  if (loading && !data) return <Loading />
  if (error != null && !data) return <ErrorBox error={error} />
  if (!data) return <div className="card"><h1>Fant ikke konkurransen</h1><Link to="/">Til forsiden</Link></div>
  const { comp, items, options, entries } = data
  const byItem = new Map(entries.map((e) => [e.item_id, e]))
  const answered = items.filter((i) => byItem.has(i.id)).length
  const open = comp.status === 'open'
  const guessLabel = (id: string | null) => (id ? options.find((o) => o.id === id)?.label ?? '?' : 'Vet ikke')

  function startEdit() {
    const d: Record<string, Draft> = {}
    for (const it of items) d[it.id] = original[it.id] ?? { score: null, guess: null, comment: '' }
    setDrafts(d); setMissing([]); setMsg(null); setEditing(true)
  }
  function cancel() {
    if (diff.changed > 0 && !confirm('Forkaste endringene dine?')) return
    setEditing(false); setMissing([]); setMsg(null)
  }
  const patch = (id: string, p: Partial<Draft>) => { setDrafts((s) => ({ ...s, [id]: { ...s[id], ...p } })); setMissing((m) => m.filter((x) => x !== id)) }

  async function saveAll() {
    setMsg(null)
    if (diff.missingScore.length) {
      setMissing(diff.missingScore)
      const nums = diff.missingScore.map((id) => items.findIndex((i) => i.id === id) + 1).join(', ')
      setMsg({ kind: 'err', text: `Velg score for glass ${nums} før du lagrer.` })
      return
    }
    if (!diff.toSave.length) { setEditing(false); return }
    setBusy(true)
    try {
      for (const s of diff.toSave) await saveEntry({ user_id: uid, item_id: s.itemId, score: s.score, guess_option_id: s.guess, comment: s.comment })
      await reload()
      setEditing(false)
      setMsg({ kind: 'ok', text: `Lagret ${diff.toSave.length} ${diff.toSave.length === 1 ? 'svar' : 'svar'} ✓` })
    } catch (e) {
      setMsg({ kind: 'err', text: `Kunne ikke lagre: ${errorMessage(e)}` })
    }
    setBusy(false)
  }

  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Mine svar</h1>
        <StatusBadge status={comp.status} />
      </div>
      <p className="muted-on-bg" style={{ margin: '0 0 12px' }}>{comp.title} · {answered} av {items.length} glass besvart</p>

      {open && !editing && items.length > 0 && (
        <button className="btn green block" style={{ marginBottom: 12 }} onClick={startEdit} data-testid="rediger-alle">✏️ Rediger svar</button>
      )}
      {msg && <p role={msg.kind === 'err' ? 'alert' : 'status'} className={msg.kind === 'err' ? 'on-bg-error' : 'muted-on-bg'} data-testid="mine-melding" style={{ fontWeight: 700 }}>{msg.text}</p>}

      {items.map((it, i) => {
        const e = byItem.get(it.id)
        const d = drafts[it.id]
        if (editing && d) {
          const bad = missing.includes(it.id)
          return (
            <section key={it.id} className={`card edit-card ${bad ? 'bad' : ''}`} aria-label={`Glass ${i + 1}`} data-testid="rediger-kort">
              <header className="glass-band">
                <h2>Glass {i + 1}</h2><span className="small">av {items.length}</span>
                {original[it.id] === null && <span className="badge">ikke besvart</span>}
              </header>
              <fieldset className="edit-section">
                <legend>Score</legend>
                <p className="soft small" style={{ margin: '0 0 6px' }}>{SCORE_MIN} = uspiselig, {SCORE_MAX} = perfekt</p>
                <div className="score-grid" role="radiogroup" aria-label={`Score for glass ${i + 1}`}>
                  {Array.from({ length: SCORE_MAX }, (_, k) => k + 1).map((n) => (
                    <label key={n}>
                      <input type="radio" name={`mine-score-${it.id}`} value={n} checked={d.score === n} onChange={() => patch(it.id, { score: n })} />
                      <span className={d.score === n ? 'on' : ''} data-on={d.score === n ? '1' : '0'}>{n}</span>
                    </label>
                  ))}
                </div>
                {bad && <p className="error" role="alert" style={{ margin: 0 }}>Velg en score.</p>}
              </fieldset>
              {options.length > 0 && (
                <div className="edit-section">
                  <label className="field" htmlFor={`mine-gjett-${it.id}`}>Gjetter på</label>
                  <select id={`mine-gjett-${it.id}`} value={d.guess ?? ''} onChange={(ev) => patch(it.id, { guess: ev.target.value || null })}>
                    <option value="">Vet ikke</option>
                    {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              )}
              <div className="edit-section" style={{ marginBottom: 0 }}>
                <label className="field" htmlFor={`mine-kommentar-${it.id}`}>Kommentar <span className="soft">(valgfri)</span></label>
                <textarea id={`mine-kommentar-${it.id}`} value={d.comment} maxLength={COMMENT_MAX} placeholder="Hva smakte du?" onChange={(ev) => patch(it.id, { comment: ev.target.value })} />
              </div>
            </section>
          )
        }
        return (
          <section key={it.id} className="card" aria-label={`Glass ${i + 1}`}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>Glass {i + 1}</h2>
              {open && !editing && <Link className="btn green small" to={`/k/${comp.slug}?glass=${i + 1}`}>{e ? 'Endre' : 'Svar'}</Link>}
            </div>
            {e ? (
              <>
                <p style={{ margin: '10px 0 4px' }}><strong>Score:</strong> <span data-testid={`score-${i + 1}`}>{e.score}</span> av 10</p>
                <p style={{ margin: '0 0 4px' }}><strong>Gjetter på:</strong> {guessLabel(e.guess_option_id)}</p>
                <p style={{ margin: 0 }}><strong>Kommentar:</strong> {e.comment ? e.comment : <span className="soft">ingen</span>}</p>
              </>
            ) : (
              <p className="soft" style={{ margin: '10px 0 0' }}>Ikke besvart ennå.</p>
            )}
          </section>
        )
      })}

      {editing ? (
        <div className="edit-bar" role="region" aria-label="Lagre endringer">
          <button className="btn ghost" onClick={cancel} disabled={busy}>Avbryt</button>
          <button className="btn green grow" onClick={() => void saveAll()} disabled={busy || diff.changed === 0} data-testid="lagre-alle">
            {busy ? 'Lagrer …' : diff.changed === 0 ? 'Ingen endringer' : `Lagre alle (${diff.changed} ${diff.changed === 1 ? 'endring' : 'endringer'})`}
          </button>
        </div>
      ) : (
        <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {open && answered < items.length && <Link className="btn gold" to={`/k/${comp.slug}`}>Fortsett å smake →</Link>}
          {comp.status === 'closed' && <Link className="btn gold" to={`/k/${comp.slug}/resultat`}>Se resultatene →</Link>}
          <Link className="btn gold" to="/">Til forsiden</Link>
        </p>
      )}
      {editing && <div style={{ height: 84 }} aria-hidden="true" />}
    </>
  )
}
