import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCompetition, getLiveBoard } from '../api/data'
import type { Competition, Id, LiveBoard } from '../api/types'
import { ErrorBox, Loading } from '../components/ui'
import { formatScore, pluralize, rankBy, scoreBarWidth } from '../lib/format'
import { ApiError } from '../api/client'

const POLL_MS = 5000
type View = 'all' | Id

interface Row { item_id: Id; position: number; label: string; brus: string | null; avg: number | null; n: number }

export function rowsFor(board: LiveBoard, view: View): Row[] {
  return board.items.map((i) => {
    if (view === 'all') return { item_id: i.item_id, position: i.position, label: i.label, brus: i.brus, avg: i.avg_score, n: i.n }
    const o = i.by_office.find((x) => String(x.office_id) === String(view))
    return { item_id: i.item_id, position: i.position, label: i.label, brus: i.brus, avg: o?.avg_score ?? null, n: o?.n ?? 0 }
  })
}

export default function Tavle() {
  const { slug = '' } = useParams()
  const [comp, setComp] = useState<Competition | null | undefined>(undefined)
  const [board, setBoard] = useState<LiveBoard | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [view, setView] = useState<View>('all')
  const [changed, setChanged] = useState<Set<Id>>(new Set())
  const prev = useRef<Record<string, number | null>>({})

  useEffect(() => { void getCompetition(slug).then(setComp).catch((e) => { setError(e); setComp(null) }) }, [slug])

  const refresh = useCallback(async (id: Id) => {
    try {
      const b = await getLiveBoard(id)
      // marker glass der snittet endret seg (kort puls)
      const ch = new Set<Id>()
      for (const it of b.items) {
        const key = `${view}:${it.item_id}`
        const now = rowsFor(b, view).find((r) => r.item_id === it.item_id)?.avg ?? null
        if (key in prev.current && prev.current[key] !== now) ch.add(it.item_id)
        prev.current[key] = now
      }
      setChanged(ch)
      setBoard(b); setError(null)
    } catch (e) { setError(e) }
  }, [view])

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

  const ranked = useMemo(() => (board ? rankBy(rowsFor(board, view), (r) => r.avg) : []), [board, view])

  if (comp === undefined) return <Loading />
  if (comp === null) return <div className="card"><h1>Fant ikke konkurransen</h1><Link to="/">Til forsiden</Link></div>
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
  const closed = board.status === 'closed'

  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Live tavle</h1>
        <span className="live-badge" aria-live="polite"><i className="live-dot" aria-hidden="true" />{closed ? 'Avsluttet' : 'Live'}</span>
      </div>
      <p className="muted-on-bg" style={{ margin: '0 0 12px' }}>{comp.title}</p>

      <div className="tabs" role="tablist" aria-label="Velg tavle">
        <button role="tab" aria-selected={view === 'all'} className={`tab ${view === 'all' ? 'on' : ''}`} onClick={() => setView('all')}>Samlet</button>
        {board.offices.map((o) => (
          <button key={o.office_id} role="tab" aria-selected={String(view) === String(o.office_id)}
            className={`tab ${String(view) === String(o.office_id) ? 'on' : ''}`} onClick={() => setView(String(o.office_id))}>{o.name}</button>
        ))}
      </div>

      <div className="card">
        <p className="soft small" style={{ margin: '0 0 10px' }}>
          {pluralize(participants, 'deltaker', 'deltakere')} · {pluralize(entries, 'svar', 'svar')}
          {' · '}oppdatert {new Date(board.updated_at).toLocaleTimeString('nb-NO')}
        </p>
        {entries === 0 && <p>Ingen har stemt ennå. Tavlen fylles ut etter hvert som deltakerne gir poeng.</p>}
        {ranked.map(({ rank, row }) => (
          <div key={row.item_id} className={`bar-row ${changed.has(row.item_id) ? 'pulse' : ''}`}>
            <span><span className={`rank ${rank === 1 && row.avg != null ? 'r1' : ''}`} style={{ marginRight: 8 }}>{row.avg != null ? rank : '·'}</span><strong>{row.brus ?? `Plass ${rank}`}</strong></span>
            <strong>{row.avg != null ? formatScore(row.avg, 2) : <span className="soft small">venter</span>}</strong>
            <div className="bar" role="img" aria-label={`${row.brus ?? `Plass ${rank}`}: ${row.avg != null ? formatScore(row.avg, 2) : 'ikke nok svar'}`}>
              <i style={{ width: `${scoreBarWidth(row.avg)}%` }} />
            </div>
            <span className="soft small" style={{ gridColumn: '1 / -1' }}>{pluralize(row.n, 'svar', 'svar')}</span>
          </div>
        ))}
        <p className="soft small" style={{ margin: '10px 0 0' }}>
          {board.names ? 'Rangeringen viser hvilken brus som ligger hvor. ' : 'Tavlen viser rangeringen uten å si hvilket glass som er hvilket. '}Snitt vises når minst {board.min_n} har svart, slik at ingen enkeltpersoners poeng avsløres.
        </p>
      </div>

      {view === 'all' && (
        <div className="card">
          <h2>Kontorene</h2>
          {rankBy(board.offices, (o) => o.avg_score).map(({ rank, row: o }) => (
            <div key={o.office_id} className="bar-row">
              <span><span className={`rank ${rank === 1 && o.avg_score != null ? 'r1' : ''}`} style={{ marginRight: 8 }}>{o.avg_score != null ? rank : '·'}</span><strong>{o.name}</strong></span>
              <strong>{o.avg_score != null ? formatScore(o.avg_score, 2) : <span className="soft small">venter</span>}</strong>
              <div className="bar red"><i style={{ width: `${scoreBarWidth(o.avg_score)}%` }} /></div>
              <span className="soft small" style={{ gridColumn: '1 / -1' }}>{pluralize(o.participants, 'deltaker', 'deltakere')}</span>
            </div>
          ))}
        </div>
      )}

      <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!closed && <Link className="btn gold small" to={`/k/${comp.slug}`}>← Til smaking</Link>}
        {closed && <Link className="btn small" to={`/k/${comp.slug}/resultat`}>Se endelige resultater →</Link>}
      </p>
    </>
  )
}
