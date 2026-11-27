import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCompetition, getLiveBoard } from '../api/data'
import type { Competition, Id, LiveBoard } from '../api/types'
import { ErrorBox, Loading } from '../components/ui'
import { formatPercent, formatScore, pluralize, rankBy, scoreBarWidth } from '../lib/format'
import { ApiError } from '../api/client'

const POLL_MS = 5000
type View = 'all' | Id
type Mode = 'poeng' | 'gjetting'

interface Row {
  item_id: Id; position: number; label: string; brus: string | null
  avg: number | null; n: number; hits: number; guesses: number; rate: number | null
}

export function rowsFor(board: LiveBoard, view: View): Row[] {
  return board.items.map((i) => {
    const base = { item_id: i.item_id, position: i.position, label: i.label, brus: i.brus }
    if (view === 'all') return { ...base, avg: i.avg_score, n: i.n, hits: i.hits, guesses: i.guesses, rate: i.hit_rate }
    const o = i.by_office.find((x) => String(x.office_id) === String(view))
    return { ...base, avg: o?.avg_score ?? null, n: o?.n ?? 0, hits: o?.hits ?? 0, guesses: o?.guesses ?? 0, rate: o?.hit_rate ?? null }
  })
}

/** Verdien som rangeres: snittscore (poeng) eller andel riktige gjetninger (gjetting). */
export const metric = (r: Row, mode: Mode) => (mode === 'poeng' ? r.avg : r.rate)

export default function Tavle() {
  const { slug = '' } = useParams()
  const [comp, setComp] = useState<Competition | null | undefined>(undefined)
  const [board, setBoard] = useState<LiveBoard | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [view, setView] = useState<View>('all')
  const [mode, setMode] = useState<Mode>('poeng')
  const [changed, setChanged] = useState<Set<Id>>(new Set())
  const prev = useRef<Record<string, number | null>>({})

  useEffect(() => { void getCompetition(slug).then(setComp).catch((e) => { setError(e); setComp(null) }) }, [slug])

  const refresh = useCallback(async (id: Id) => {
    try {
      const b = await getLiveBoard(id)
      // marker glass der verdien endret seg (kort puls)
      const ch = new Set<Id>()
      for (const r of rowsFor(b, view)) {
        const key = `${mode}:${view}:${r.item_id}`
        const now = metric(r, mode)
        if (key in prev.current && prev.current[key] !== now) ch.add(r.item_id)
        prev.current[key] = now
      }
      setChanged(ch)
      setBoard(b); setError(null)
    } catch (e) { setError(e) }
  }, [view, mode])

  useEffect(() => {
    if (!comp) return
    let stopped = false
    const tick = () => { if (!stopped && !document.hidden) void refresh(comp.id) }
    tick()
    const t = setInterval(tick, POLL_MS)
    const vis = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', vis)
    return () => { stopped = true; clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [comp, refresh])

  useEffect(() => {
    if (!changed.size) return
    const t = setTimeout(() => setChanged(new Set()), 1800)
    return () => clearTimeout(t)
  }, [changed])

  const ranked = useMemo(() => (board ? rankBy(rowsFor(board, view), (r) => metric(r, mode)) : []), [board, view, mode])

  if (comp === undefined) return <Loading />
  if (comp === null) return <div className="card"><h1>Fant ikke konkurransen</h1><p>Trenger du en kode? Skriv den inn i feltet «Har du en kode?» på forsiden.</p><Link to="/">Til forsiden</Link></div>
  if (error instanceof ApiError && error.code === 'live_off') {
    return (
      <div className="card">
        <h1>{comp.title}</h1>
        <p>Live tavlen er ikke slått på for denne konkurransen.</p>
        <Link className="btn" to={`/k/${comp.slug}`}>Tilbake til smaking</Link>
      </div>
    )
  }
  if (error != null && !board) return <ErrorBox error={error} />
  if (!board) return <Loading />

  const office = view === 'all' ? null : board.offices.find((o) => String(o.office_id) === String(view))
  const participants = office ? office.participants : board.overall.participants
  const entries = office ? office.n_entries : board.overall.n_entries
  const hits = office ? office.hits : board.overall.hits
  const guesses = office ? office.guesses : board.overall.guesses
  const closed = board.status === 'closed'
  const poeng = mode === 'poeng'
  const people = board.people.filter((p) => view === 'all' || String(p.office_id) === String(view))
  const rankedPeople = rankBy(people, (p) => p.hits)

  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Live tavle</h1>
        <span className="live-badge" aria-live="polite"><i className="live-dot" aria-hidden="true" />{closed ? 'Avsluttet' : 'Live'}</span>
      </div>
      <p className="muted-on-bg" style={{ margin: '0 0 12px' }}>{comp.title}</p>

      <div className="tabs" role="tablist" aria-label="Velg type tavle">
        <button role="tab" aria-selected={poeng} className={`tab ${poeng ? 'on' : ''}`} onClick={() => setMode('poeng')}>Poeng</button>
        <button role="tab" aria-selected={!poeng} className={`tab ${!poeng ? 'on' : ''}`} onClick={() => setMode('gjetting')}>Gjettet riktig</button>
      </div>

      <div className="tabs" role="tablist" aria-label="Velg kontor">
        <button role="tab" aria-selected={view === 'all'} className={`tab ${view === 'all' ? 'on' : ''}`} onClick={() => setView('all')}>Samlet</button>
        {board.offices.map((o) => (
          <button key={o.office_id} role="tab" aria-selected={String(view) === String(o.office_id)}
            className={`tab ${String(view) === String(o.office_id) ? 'on' : ''}`} onClick={() => setView(String(o.office_id))}>{o.name}</button>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{poeng ? 'Snittscore per glass' : 'Gjettet riktig per glass'}</h2>
        <p className="soft small" style={{ margin: '0 0 10px' }}>
          {pluralize(participants, 'deltaker', 'deltakere')} · {poeng ? pluralize(entries, 'svar', 'svar') : `${hits} av ${guesses} gjetninger riktig`}
          {' · '}oppdatert {new Date(board.updated_at).toLocaleTimeString('nb-NO')}
        </p>
        {entries === 0 && <p>Ingen har stemt ennå. Tavlen fylles ut etter hvert som deltakerne gir poeng.</p>}
        {ranked.map(({ rank, row }) => {
          const value = metric(row, mode)
          const tied = value != null && ranked.filter((x) => x.rank === rank).length > 1
          const title = `Glass ${row.position}${row.brus ? ` – ${row.brus}` : ''}`
          const shown = value != null ? (poeng ? formatScore(value, 2) : formatPercent(value)) : null
          return (
            <div key={row.item_id} className={`bar-row ${changed.has(row.item_id) ? 'pulse' : ''}`} data-testid="tavle-row" data-avg={value ?? ''}>
              <span><span className={`rank ${rank === 1 && value != null ? 'r1' : ''}`} style={{ marginRight: 8 }} aria-hidden="true">{value != null ? rank : '·'}</span><strong>{title}</strong></span>
              <strong>{shown ?? <span className="soft small">venter</span>}</strong>
              <div className={`bar ${poeng ? '' : 'red'}`} role="img" aria-label={`${title}: ${shown ?? 'ikke nok svar'}`}>
                <i style={{ width: `${poeng ? scoreBarWidth(value) : Math.max(0, Math.min(100, (value ?? 0) * 100))}%` }} />
              </div>
              <span className="soft small" style={{ gridColumn: '1 / -1' }}>
                {value != null ? `Plass ${rank}${tied ? ' (delt)' : ''}` : 'Ingen plass ennå'} · {poeng ? pluralize(row.n, 'svar', 'svar') : `${row.hits} av ${row.guesses} riktig`}
              </span>
            </div>
          )
        })}
        <p className="soft small" style={{ margin: '10px 0 0' }}>
          {poeng && board.names ? 'Brusnavnet vises ved hvert glass. ' : ''}Plass viser rangeringen etter {poeng ? 'snitt' : 'andel riktige'}, og glassnummeret viser hvilket glass det gjelder.
          Tall vises når minst {board.min_n} har {poeng ? 'svart' : 'gjettet'}, slik at ingen enkeltpersoners svar avsløres.
        </p>
      </div>

      {!poeng && (
        <div className="card">
          <h2>Beste gjettere</h2>
          {rankedPeople.length === 0 ? (
            <p className="soft small">Listen vises når minst {board.people_min} har svart{view !== 'all' ? ' (på tvers av kontorene)' : ''}.</p>
          ) : rankedPeople.map(({ rank, row: p }, i) => (
            <div key={`${p.name}-${i}`} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }} data-testid="tavle-person">
              <span><span className={`rank ${rank === 1 ? 'r1' : ''}`} style={{ marginRight: 8 }} aria-hidden="true">{rank}</span><strong>{p.name}</strong> <span className="soft small">· {p.office_name}</span></span>
              <span><strong>{p.hits}</strong> av {p.guesses}<span className="soft small"> riktig</span></span>
            </div>
          ))}
          <p className="soft small" style={{ margin: '10px 0 0' }}>Anonyme deltakere vises som «Anonym».</p>
        </div>
      )}

      {view === 'all' && (
        <div className="card">
          <h2>Kontorene</h2>
          {rankBy(board.offices, (o) => (poeng ? o.avg_score : o.hit_rate)).map(({ rank, row: o }) => {
            const v = poeng ? o.avg_score : o.hit_rate
            return (
              <div key={o.office_id} className="bar-row">
                <span><span className={`rank ${rank === 1 && v != null ? 'r1' : ''}`} style={{ marginRight: 8 }}>{v != null ? rank : '·'}</span><strong>{o.name}</strong></span>
                <strong>{v != null ? (poeng ? formatScore(v, 2) : formatPercent(v)) : <span className="soft small">venter</span>}</strong>
                <div className="bar red"><i style={{ width: `${poeng ? scoreBarWidth(v) : Math.max(0, Math.min(100, (v ?? 0) * 100))}%` }} /></div>
                <span className="soft small" style={{ gridColumn: '1 / -1' }}>
                  {pluralize(o.participants, 'deltaker', 'deltakere')}{poeng ? '' : ` · ${o.hits} av ${o.guesses} riktig`}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!closed && <Link className="btn gold small" to={`/k/${comp.slug}`}>← Til smaking</Link>}
        {closed && <Link className="btn small" to={`/k/${comp.slug}/resultat`}>Se endelige resultater →</Link>}
      </p>
    </>
  )
}
