import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCompetition, listItems, listMyEntries, listOptions, saveEntry } from '../api/data'
import { errorMessage } from '../api/functions'
import { useAuth } from '../auth'
import { ErrorBox, Loading, StatusBadge } from '../components/ui'
import { useAsync } from '../hooks'
import { cleanComment, COMMENT_MAX, isValidScore, SCORE_MAX, SCORE_MIN } from '../lib/validation'

interface Draft { score: number | null; guess: string | null; comment: string }
type SaveState = 'idle' | 'saving' | 'saved' | 'needscore' | 'error'
const EMPTY: Draft = { score: null, guess: null, comment: '' }

/**
 * Alle egne svar på én side. Mens konkurransen er åpen er hvert kort redigerbart rett i oversikten,
 * og hver endring lagres med en gang (som på glass-for-glass-siden). Ingen «Endre»-skjerm og ingen knapp å trykke først.
 */
export default function Mine() {
  const { slug = '' } = useParams()
  const { session } = useAuth()
  const uid = session!.user.id
  const { data, error, loading } = useAsync(async () => {
    const comp = await getCompetition(slug)
    if (!comp) return null
    const [items, options] = await Promise.all([listItems(comp.id), listOptions(comp.id)])
    const entries = await listMyEntries(uid, items.map((i) => i.id))
    return { comp, items, options, entries }
  }, [slug, uid])

  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const draftsRef = useRef(drafts)
  const [status, setStatus] = useState<Record<string, SaveState>>({})
  const [errText, setErrText] = useState<Record<string, string>>({})
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const queue = useRef<Record<string, Promise<void>>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const dirty = useRef<Set<string>>(new Set())

  // Fyll utkastene fra det som er lagret, én gang.
  useEffect(() => {
    if (!data) return
    const d: Record<string, Draft> = {}
    for (const it of data.items) {
      const e = data.entries.find((x) => x.item_id === it.id)
      d[it.id] = e ? { score: e.score, guess: e.guess_option_id, comment: e.comment ?? '' } : { ...EMPTY }
    }
    draftsRef.current = d
    setDrafts(d)
    setSavedIds(new Set(data.entries.map((e) => e.item_id)))
  }, [data])

  const persist = useCallback((id: string) => {
    // Lagringer for samme glass kjøres etter hverandre, og leser alltid det nyeste utkastet.
    queue.current[id] = (queue.current[id] ?? Promise.resolve()).then(async () => {
      dirty.current.delete(id)
      const d = draftsRef.current[id]
      if (!d || !isValidScore(d.score)) { setStatus((s) => ({ ...s, [id]: 'needscore' })); return }
      setStatus((s) => ({ ...s, [id]: 'saving' }))
      try {
        await saveEntry({ user_id: uid, item_id: id, score: d.score, guess_option_id: d.guess, comment: cleanComment(d.comment) })
        setSavedIds((s) => new Set(s).add(id))
        setStatus((s) => ({ ...s, [id]: dirty.current.has(id) ? 'saving' : 'saved' }))
      } catch (e) {
        setErrText((s) => ({ ...s, [id]: errorMessage(e) }))
        setStatus((s) => ({ ...s, [id]: 'error' }))
      }
    })
  }, [uid])

  const update = (id: string, patch: Partial<Draft>, now: boolean) => {
    const next = { ...(draftsRef.current[id] ?? EMPTY), ...patch }
    draftsRef.current = { ...draftsRef.current, [id]: next }
    setDrafts(draftsRef.current)
    dirty.current.add(id)
    clearTimeout(timers.current[id]); delete timers.current[id]
    if (now) persist(id)
    else timers.current[id] = setTimeout(() => { delete timers.current[id]; persist(id) }, 700)
  }
  const flushAll = useCallback(() => {
    for (const id of Object.keys(timers.current)) { clearTimeout(timers.current[id]); delete timers.current[id]; persist(id) }
  }, [persist])
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushAll() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flushAll)
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flushAll); flushAll() }
  }, [flushAll])

  if (loading && !data) return <Loading />
  if (error != null && !data) return <ErrorBox error={error} />
  if (!data) return <div className="card"><h1>Fant ikke konkurransen</h1><Link to="/">Til forsiden</Link></div>
  const { comp, items, options } = data
  const open = comp.status === 'open'
  const answered = items.filter((i) => savedIds.has(i.id)).length
  const guessLabel = (id: string | null) => (id ? options.find((o) => o.id === id)?.label ?? '?' : 'Vet ikke')

  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Mine svar</h1>
        <StatusBadge status={comp.status} />
      </div>
      <p className="muted-on-bg" style={{ margin: '0 0 12px' }}>{comp.title} · {answered} av {items.length} glass besvart</p>
      {open && <p className="muted-on-bg small" style={{ margin: '0 0 12px' }}>Trykk på et tall for å endre scoren. Endringer lagres med en gang.</p>}

      {items.map((it, i) => {
        const d = drafts[it.id] ?? EMPTY
        const st = status[it.id] ?? 'idle'
        if (!open) {
          const sv = data.entries.find((x) => x.item_id === it.id)
          return (
            <section key={it.id} className="card" aria-label={`Glass ${i + 1}`}>
              <h2 style={{ margin: 0 }}>Glass {i + 1}</h2>
              {sv ? (
                <>
                  <p style={{ margin: '10px 0 4px' }}><strong>Score:</strong> <span data-testid={`score-${i + 1}`}>{sv.score}</span> av 10</p>
                  <p style={{ margin: '0 0 4px' }}><strong>Gjetter på:</strong> {guessLabel(sv.guess_option_id)}</p>
                  <p style={{ margin: 0 }}><strong>Kommentar:</strong> {sv.comment ? sv.comment : <span className="soft">ingen</span>}</p>
                </>
              ) : <p className="soft" style={{ margin: '10px 0 0' }}>Ikke besvart.</p>}
            </section>
          )
        }
        return (
          <section key={it.id} className="card edit-card" aria-label={`Glass ${i + 1}`} data-testid="rediger-kort">
            <header className="glass-band">
              <h2>Glass {i + 1}</h2><span className="small">av {items.length}</span>
              {!savedIds.has(it.id) && <span className="badge">ikke besvart</span>}
            </header>
            <fieldset className="edit-section">
              <legend>Score</legend>
              <p className="soft small" style={{ margin: '0 0 6px' }}>{SCORE_MIN} = uspiselig, {SCORE_MAX} = perfekt</p>
              <div className="score-grid" role="radiogroup" aria-label={`Score for glass ${i + 1}`}>
                {Array.from({ length: SCORE_MAX }, (_, k) => k + 1).map((n) => (
                  <label key={n}>
                    <input type="radio" name={`mine-score-${it.id}`} value={n} checked={d.score === n} onChange={() => update(it.id, { score: n }, true)} />
                    <span className={d.score === n ? 'on' : ''} data-on={d.score === n ? '1' : '0'}>{n}</span>
                  </label>
                ))}
              </div>
              <span data-testid={`score-${i + 1}`} hidden>{d.score ?? ''}</span>
            </fieldset>
            {options.length > 0 && (
              <div className="edit-section">
                <label className="field" htmlFor={`mine-gjett-${it.id}`}>Gjetter på</label>
                <select id={`mine-gjett-${it.id}`} value={d.guess ?? ''} onChange={(ev) => update(it.id, { guess: ev.target.value || null }, true)}>
                  <option value="">Vet ikke</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div className="edit-section" style={{ marginBottom: 0 }}>
              <label className="field" htmlFor={`mine-kommentar-${it.id}`}>Kommentar <span className="soft">(valgfri)</span></label>
              <textarea id={`mine-kommentar-${it.id}`} value={d.comment} maxLength={COMMENT_MAX} placeholder="Hva smakte du?"
                onChange={(ev) => update(it.id, { comment: ev.target.value }, false)} onBlur={() => { if (timers.current[it.id]) { clearTimeout(timers.current[it.id]); delete timers.current[it.id]; persist(it.id) } }} />
              <p className={`save-state small ${st === 'error' || st === 'needscore' ? 'err' : ''}`} role="status" aria-live="polite" data-testid={`status-${i + 1}`} style={{ margin: '6px 0 0', minHeight: '1.3em' }}>
                {st === 'saving' && 'Lagrer …'}
                {st === 'saved' && 'Lagret ✓'}
                {st === 'needscore' && 'Velg en score for å lagre.'}
                {st === 'error' && `Kunne ikke lagre: ${errText[it.id] ?? ''}`}
              </p>
            </div>
          </section>
        )
      })}

      <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {comp.status === 'closed' && <Link className="btn gold" to={`/k/${comp.slug}/resultat`}>Se resultatene →</Link>}
        <Link className="btn gold" to="/">Til forsiden</Link>
      </p>
    </>
  )
}
