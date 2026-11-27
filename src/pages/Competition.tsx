import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getCompetition, listItems, listMyEntries, listOptions, saveEntry } from '../api/data'
import { errorMessage } from '../api/functions'
import type { Competition as Comp, GuessOption, Id, Item } from '../api/types'
import { useAuth } from '../auth'
import { ErrorBox, Loading, Progress, StatusBadge } from '../components/ui'
import { useAsync } from '../hooks'
import { CommentField, TagPicker } from '../components/Taste'
import { glassList, usedGuesses } from '../lib/guesses'
import { cleanComment, cleanTags, COMMENT_MAX, isValidScore, SCORE_MAX, SCORE_MIN } from '../lib/validation'

interface Draft { score: number | null; guess: Id | null; comment: string; tags: string[] }
type SaveState = 'idle' | 'saving' | 'saved' | 'needscore' | 'error'
const SAVE_DELAY = 700

interface Loaded { comp: Comp; items: Item[]; options: GuessOption[]; drafts: Record<Id, Draft> }

export default function Competition() {
  const { slug = '' } = useParams()
  const { session } = useAuth()
  const uid = session!.user.id
  const { data, error, loading } = useAsync<Loaded | null>(async () => {
    const comp = await getCompetition(slug)
    if (!comp) return null
    const [items, options] = await Promise.all([listItems(comp.id), listOptions(comp.id)])
    const entries = await listMyEntries(uid, items.map((i) => i.id))
    const drafts: Record<Id, Draft> = {}
    for (const e of entries) drafts[e.item_id] = { score: e.score, guess: e.guess_option_id, comment: e.comment ?? '', tags: cleanTags(e.tags) }
    return { comp, items, options, drafts }
  }, [slug, uid])

  if (loading) return <Loading />
  if (error != null) return <ErrorBox error={error} />
  if (!data) return <div className="card"><h1>Fant ikke konkurransen</h1><p>Trenger du en kode? Skriv den inn i feltet «Har du en kode?» på forsiden.</p><Link to="/">Til forsiden</Link></div>
  return <Stepper key={data.comp.id} uid={uid} {...data} />
}

function Stepper({ uid, comp, items, options, drafts: initial }: { uid: Id } & Loaded) {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const locked = comp.status !== 'open'
  const [drafts, setDrafts] = useState(initial)
  const draftsRef = useRef(initial)
  const [saveState, setSaveState] = useState<Record<Id, SaveState>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const timers = useRef<Record<Id, number>>({})
  const chain = useRef<Promise<void>>(Promise.resolve())

  // Uten ?glass= starter vi på første glass du ikke har svart på (ikke alltid glass 1), eller glass 1 når alt er besvart.
  const firstUnanswered = items.findIndex((it) => !initial[it.id])
  const startIdx = firstUnanswered >= 0 ? firstUnanswered : 0
  const idx = Math.min(Math.max((Number(params.get('glass')) || startIdx + 1) - 1, 0), Math.max(items.length - 1, 0))
  const item = items[idx]
  const setIdx = (i: number) => { flushAll(); setParams({ glass: String(i + 1) }, { replace: true }); window.scrollTo({ top: 0 }) }

  const persist = useCallback((itemId: Id) => {
    const d = draftsRef.current[itemId]
    if (!d || !isValidScore(d.score)) { setSaveState((s) => ({ ...s, [itemId]: 'needscore' })); return }
    setSaveState((s) => ({ ...s, [itemId]: 'saving' }))
    const payload = { user_id: uid, item_id: itemId, score: d.score, guess_option_id: d.guess, comment: cleanComment(d.comment), tags: cleanTags(d.tags) }
    chain.current = chain.current.then(async () => {
      try {
        await saveEntry(payload)
        setSaveState((s) => ({ ...s, [itemId]: 'saved' })); setSaveError(null)
      } catch (e) {
        setSaveState((s) => ({ ...s, [itemId]: 'error' })); setSaveError(errorMessage(e))
      }
    })
  }, [uid])

  const flushAll = useCallback(() => {
    for (const [id, t] of Object.entries(timers.current)) { window.clearTimeout(t); delete timers.current[id]; persist(id) }
  }, [persist])

  /** Lagre alt som venter, og vent til det er ferdig før vi navigerer (så oversikten viser siste versjon). */
  const leave = useCallback(async (to: string) => { flushAll(); await chain.current; nav(to) }, [flushAll, nav])

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushAll() }
    document.addEventListener('visibilitychange', onHide)
    return () => { document.removeEventListener('visibilitychange', onHide); flushAll() }
  }, [flushAll])

  function update(itemId: Id, patch: Partial<Draft>, immediate: boolean) {
    if (locked) return
    const next = { ...(draftsRef.current[itemId] ?? { score: null, guess: null, comment: '', tags: [] }), ...patch }
    draftsRef.current = { ...draftsRef.current, [itemId]: next }
    setDrafts(draftsRef.current)
    window.clearTimeout(timers.current[itemId]); delete timers.current[itemId]
    if (immediate) persist(itemId)
    else {
      setSaveState((s) => ({ ...s, [itemId]: 'idle' }))
      timers.current[itemId] = window.setTimeout(() => { delete timers.current[itemId]; persist(itemId) }, SAVE_DELAY)
    }
  }

  if (!item) return <div className="card"><h1>{comp.title}</h1><p>Ingen glass er lagt inn ennå.</p><Link to="/">Til forsiden</Link></div>

  const used = usedGuesses(items.map((i) => i.id), (id) => drafts[id]?.guess, item.id)
  const d = drafts[item.id] ?? { score: null, guess: null, comment: '', tags: [] }
  const done = Object.values(drafts).filter((x) => isValidScore(x.score)).length
  const st = saveState[item.id] ?? 'idle'
  const last = idx === items.length - 1

  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>{comp.title}</h1>
        <StatusBadge status={comp.status} />
      </div>
      {done > 0 && (
        <p style={{ margin: '0 0 10px' }}><button className="btn ghost-light small" onClick={() => void leave(`/k/${comp.slug}/mine`)}>📋 Mine svar</button></p>
      )}
      {comp.live_board && comp.status === 'open' && (
        <p style={{ margin: '0 0 10px' }}><Link className="btn gold small" to={`/k/${comp.slug}/tavle`}>📊 Se live tavle</Link></p>
      )}
      {locked && (
        <div className="card-alt" role="status">
          <strong>{comp.status === 'closed' ? 'Konkurransen er avsluttet.' : 'Konkurransen er ikke åpen ennå.'}</strong> Svarene er låst.{' '}
          {comp.status === 'closed' && <Link to={`/k/${comp.slug}/resultat`}>Se resultatene</Link>}
        </div>
      )}
      <p className="muted-on-bg" style={{ margin: '0 0 6px' }}>{done} av {items.length} glass smakt</p>
      <Progress value={done} max={items.length} label="Fremdrift" />
      <nav aria-label="Velg glass">
        <div className="step-chips">
          {items.map((it, i) => (
            <button key={it.id} className={`chip ${isValidScore(drafts[it.id]?.score) ? 'done' : ''}`} aria-current={i === idx ? 'step' : undefined}
              aria-label={`Glass ${i + 1}${isValidScore(drafts[it.id]?.score) ? ', besvart' : ''}`} onClick={() => setIdx(i)}>{i + 1}</button>
          ))}
        </div>
      </nav>

      <section key={item.id} className="card edit-card" style={{ marginTop: 16 }} aria-labelledby="glass-h">
        <header className="glass-band">
          <h2 id="glass-h">Glass {idx + 1} av {items.length}{item.label && item.label !== String(idx + 1) && item.label !== `Glass ${idx + 1}` ? ` – ${item.label}` : ''}</h2>
        </header>

        <fieldset className="edit-section" disabled={locked}>
          <legend>Score</legend>
          <p className="soft small" style={{ margin: '0 0 6px' }}>{SCORE_MIN} = dårlig, {SCORE_MAX} = fantastisk</p>
          <div className="score-grid" role="radiogroup" aria-label={`Score fra ${SCORE_MIN} til ${SCORE_MAX}`}>
            {Array.from({ length: SCORE_MAX }, (_, k) => k + 1).map((n) => (
              <label key={`${item.id}-${n}`}>
                <input type="radio" name={`score-${item.id}`} value={n} checked={d.score === n} onChange={() => update(item.id, { score: n }, true)} />
                <span className={d.score === n ? 'on' : ''} data-on={d.score === n ? '1' : '0'}>{n}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {options.length > 0 && (
          <fieldset className="edit-section" disabled={locked}>
            <legend>Hva tror du det er?</legend>
            <div className="option-list">
              <label key={`${item.id}-none`}><input type="radio" name={`guess-${item.id}`} checked={d.guess === null} onChange={() => update(item.id, { guess: null }, true)} /><span className={d.guess === null ? 'on' : ''}>Vet ikke</span></label>
              {options.map((o) => (
                <label key={`${item.id}-${o.id}`}><input type="radio" name={`guess-${item.id}`} checked={d.guess === o.id} onChange={() => update(item.id, { guess: o.id }, true)} /><span className={d.guess === o.id ? 'on' : ''}>{o.label}{used.get(o.id) && <small className="used" data-testid="alt-gjettet" aria-label={`Du har alt gjettet dette på ${glassList(used.get(o.id)!)}`}>✓ {glassList(used.get(o.id)!)}</small>}</span></label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="edit-section" disabled={locked}>
          <legend>Hvordan smaker det? <span className="soft">(valgfritt)</span></legend>
          <TagPicker name={item.id} value={d.tags} disabled={locked} onChange={(tags) => update(item.id, { tags }, true)} />
        </fieldset>

        <div className="edit-section" style={{ marginBottom: 0 }}>
        <CommentField id="comment" value={d.comment} maxLength={COMMENT_MAX} disabled={locked} counter
          onChange={(v) => update(item.id, { comment: v }, false)} onBlur={() => { if (timers.current[item.id]) flushAll() }} />
        <div className="row between small soft" style={{ marginTop: 6 }}>
          <span />
          <span className={`save-state ${st === 'error' ? 'err' : ''}`} role="status" aria-live="polite">
            {st === 'saving' && 'Lagrer …'}
            {st === 'saved' && 'Lagret ✓'}
            {st === 'needscore' && 'Velg en score for å lagre.'}
            {st === 'error' && `Kunne ikke lagre: ${saveError ?? ''}`}
          </span>
        </div>
        </div>
      </section>

      <div className="stepper-nav">
        <div className="stepper-nav-inner">
          <button className="btn ghost-light" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Forrige</button>
          {last ? (
            <button className="btn gold" onClick={() => void leave(`/k/${comp.slug}/mine`)}>Ferdig – se svarene mine</button>
          ) : (
            <button className="btn gold" onClick={() => setIdx(idx + 1)}>Neste →</button>
          )}
        </div>
      </div>
    </>
  )
}
