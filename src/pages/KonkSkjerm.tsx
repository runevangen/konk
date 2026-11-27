import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCompetition, getLiveBoard, getResults } from '../api/data'
import { ApiError } from '../api/client'
import type { Competition, LiveBoard, Results, ResultsItem } from '../api/types'
import { Qr } from '../components/Qr'
import { Loading } from '../components/ui'
import { formatPercent, formatScore, pluralize, rankBy, scoreBarWidth } from '../lib/format'
import { tasteProfile } from '../lib/validation'

const POLL_MS = 4000

/**
 * Storskjerm for en konkurranse (admin). Mens den er åpen: live tavle med kode og QR så flere kan bli med.
 * Når den er avsluttet: avsløring fra siste til første plass (admin trykker Neste), så oppsummering med topp 10,
 * kontorene, beste gjettere og kommentarer. Kommentarer vises først etter avslutning, så de ikke røper noe under smakingen.
 */
export default function KonkSkjerm() {
  const { slug = '' } = useParams()
  const [comp, setComp] = useState<Competition | null | undefined>(undefined)
  const [board, setBoard] = useState<LiveBoard | null>(null)
  const [liveOff, setLiveOff] = useState(false)
  const [results, setResults] = useState<Results | null>(null)
  const [step, setStep] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { void getCompetition(slug).then(setComp).catch(() => setComp(null)) }, [slug])
  useEffect(() => { document.title = `Storskjerm ${comp?.title ?? ''} – Konkurranser` }, [comp?.title])
  useEffect(() => { document.body.classList.add('skjerm-modus'); return () => document.body.classList.remove('skjerm-modus') }, [])

  const closed = comp?.status === 'closed'

  const pollBoard = useCallback(async (id: string) => {
    try { setBoard(await getLiveBoard(id)); setLiveOff(false); setErr(null) } catch (e) {
      if (e instanceof ApiError && e.code === 'live_off') setLiveOff(true); else setErr('Fikk ikke hentet tavlen. Prøver igjen …')
    }
  }, [])
  useEffect(() => {
    if (!comp) return
    let stop = false
    const tick = () => { if (!stop && !document.hidden) void pollBoard(comp.id) }
    tick()
    const t = setInterval(tick, closed ? 30000 : POLL_MS)
    return () => { stop = true; clearInterval(t) }
  }, [comp, closed, pollBoard])
  // Resultatene hentes når konkurransen er avsluttet.
  useEffect(() => {
    if (!comp || !closed) return
    void getResults(comp.id).then(setResults).catch(() => setErr('Fikk ikke hentet resultatene.'))
  }, [comp, closed])

  const ranked = useMemo(() => (results ? rankBy(results.items, (i) => i.avg_score) : []), [results])
  const reveal = useMemo(() => [...ranked].reverse(), [ranked])           // siste plass først
  const total = reveal.length
  const lastStep = total + 1                                                // total glass + oppsummering

  const next = useCallback(() => setStep((s) => Math.min(lastStep, s + 1)), [lastStep])
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), [])
  useEffect(() => {
    if (!closed) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); back() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [closed, next, back])

  const wrap = (c: React.ReactNode) => <div className="skjerm" data-testid="konk-skjerm">{c}</div>
  if (comp === undefined) return wrap(<Loading />)
  if (comp === null) return wrap(<><h1>Fant ikke konkurransen</h1><Link className="btn" to="/">Til forsiden</Link></>)

  // ---------- Åpen: live ----------
  if (!closed) {
    const names = !!board?.names
    const rows = board ? rankBy(board.items, (i) => i.avg_score) : []
    return wrap(
      <>
        <div className="row between">
          <h1 style={{ margin: 0 }}>{comp.title}</h1>
          <span className="live-badge"><i className="live-dot" aria-hidden="true" />Live</span>
        </div>
        <div className="skjerm-live">
          <div>
            {liveOff && <p className="skjerm-label">Live tavlen er ikke slått på for denne konkurransen.</p>}
            {board && board.overall.n_entries === 0 && <p className="skjerm-label">Ingen har gitt poeng ennå. Tavlen fylles ut etter hvert.</p>}
            {rows.map(({ rank, row }) => (
              <div key={row.item_id} className="skjerm-bar" data-testid="skjerm-glass">
                <span className="skjerm-bar-label"><span className="skjerm-rank">{row.avg_score != null ? rank : '·'}</span>Glass {row.position}{names && row.brus ? ` – ${row.brus}` : ''}</span>
                <span className="skjerm-bar-track" aria-hidden="true"><i style={{ width: `${scoreBarWidth(row.avg_score)}%` }} /></span>
                <strong className="skjerm-bar-val">{row.avg_score != null ? formatScore(row.avg_score, 2) : '–'}</strong>
              </div>
            ))}
          </div>
          <aside className="skjerm-side">
            <div className="skjerm-qrboks"><Qr code={comp.code} /><p className="skjerm-label"><strong>Skann for å bli med</strong></p></div>
            <div className="skjerm-code skjerm-code-liten" data-testid="skjerm-kode">{comp.code}</div>
            {board && (
              <>
                <p className="skjerm-label" data-testid="skjerm-deltakere">{pluralize(board.overall.participants, 'deltaker', 'deltakere')} · {pluralize(board.overall.n_entries, 'svar', 'svar')}</p>
                {board.offices.filter((o) => o.participants > 0).map((o) => (
                  <p key={o.office_id} className="skjerm-label" style={{ margin: 0 }}><strong>{o.name}</strong> snitt {formatScore(o.avg_score, 2)} · {pluralize(o.participants, 'deltaker', 'deltakere')}</p>
                ))}
              </>
            )}
            {err && <p className="skjerm-label">{err}</p>}
          </aside>
        </div>
      </>,
    )
  }

  // ---------- Avsluttet: avsløring ----------
  if (!results) return wrap(<><h1>{comp.title}</h1><Loading text="Henter resultatene …" /></>)
  const controls = (
    <div className="skjerm-kontroll">
      <button className="btn ghost small" onClick={back} disabled={step === 0} aria-label="Forrige">◀</button>
      <span className="skjerm-label" style={{ margin: 0 }}>{step === 0 ? 'Klar' : step <= total ? `${step} av ${total}` : 'Oppsummering'}</span>
      <button className="btn gold small" onClick={next} disabled={step === lastStep} data-testid="skjerm-neste">Neste ▶</button>
    </div>
  )

  if (step === 0) {
    return wrap(
      <>
        <div className="skjerm-midt">
          <p className="skjerm-label">{comp.title}</p>
          <h1 style={{ fontSize: 'clamp(2.5rem, 9vh, 5rem)' }}>Nå avslører vi resultatet 🏆</h1>
          <p className="skjerm-label">{pluralize(results.overall.participants, 'deltaker', 'deltakere')} · {pluralize(total, 'glass', 'glass')}</p>
          <p className="skjerm-label"><em>Trykk Neste eller piltast → for å starte</em></p>
        </div>
        {controls}
      </>,
    )
  }
  if (step <= total) {
    const { rank, row } = reveal[step - 1]
    return wrap(<><RevealGlass rank={rank} row={row} comments={results.comments} isWinner={rank === 1} />{controls}</>)
  }
  return wrap(<><Summary results={results} ranked={ranked} board={liveOff ? null : board} /> {controls}</>)
}

function RevealGlass({ rank, row, comments, isWinner }: { rank: number; row: ResultsItem; comments: Results['comments']; isWinner: boolean }) {
  const mine = comments.filter((c) => c.item_id === row.item_id)
  const quote = mine.find((c) => c.featured) ?? mine[0]
  const taste = tasteProfile(row.tags, row.n).slice(0, 4)
  return (
    <div className="skjerm-reveal" key={row.item_id} data-testid="skjerm-avslort">
      <p className="skjerm-label">{isWinner ? '🏆 Vinneren' : `Plass ${rank}`}</p>
      <div className="skjerm-reveal-hode">
        <span className="skjerm-plass">{rank}</span>
        <div>
          <h1 style={{ margin: 0 }}>{row.correct_label ?? `Glass ${row.position}`}</h1>
          <p className="skjerm-label" style={{ margin: 0 }}>Glass {row.position}</p>
        </div>
        <strong className="skjerm-poeng-stor">{formatScore(row.avg_score, 2)}</strong>
      </div>
      <div className="skjerm-bar-track" aria-hidden="true" style={{ height: 22 }}><i style={{ width: `${scoreBarWidth(row.avg_score)}%` }} /></div>
      <div className="skjerm-fakta">
        {row.by_office.map((o) => <span key={o.office_id}><strong>{o.name}</strong> {formatScore(o.avg_score, 2)}</span>)}
        <span><strong>{formatPercent(row.hit_rate)}</strong> gjettet riktig</span>
        <span>{pluralize(row.n, 'vurdering', 'vurderinger')}</span>
      </div>
      {taste.length > 0 && <div className="skjerm-fakta" data-testid="skjerm-smak">{taste.map((t) => <span key={t.tag} className="skjerm-chip">{t.tag} {t.count}</span>)}</div>}
      {quote && (
        <blockquote className="quote skjerm-sitat" data-testid="skjerm-sitat">«{quote.comment}»
          <div className="who">{quote.featured ? '⭐ Dagens sitat · ' : ''}{quote.display_name ?? 'Anonym'} · {quote.office_name}</div>
        </blockquote>
      )}
    </div>
  )
}

function Summary({ results, ranked, board }: { results: Results; ranked: { rank: number; row: ResultsItem }[]; board: LiveBoard | null }) {
  const people = board ? rankBy(board.people.filter((p) => p.guesses > 0), (p) => p.hits).slice(0, 10) : []
  const offices = results.offices.filter((o) => o.participants > 0)
  const quotes = useMemo(() => {
    const byPos = new Map(results.items.map((i) => [i.item_id, i.position]))
    return [...results.comments].sort((a, b) => Number(b.featured) - Number(a.featured) || (byPos.get(a.item_id) ?? 0) - (byPos.get(b.item_id) ?? 0))
  }, [results])
  const [qi, setQi] = useState(0)
  useEffect(() => {
    if (quotes.length < 2) return
    const t = setInterval(() => setQi((i) => (i + 1) % quotes.length), 7000)
    return () => clearInterval(t)
  }, [quotes.length])
  const q = quotes[qi]
  return (
    <div data-testid="skjerm-oppsummering">
      <h1 style={{ margin: '0 0 6px' }}>Resultat 🎉</h1>
      <div className="skjerm-bunn">
        <div>
          <h2>Topp 10</h2>
          <ol className="rank-list compact" aria-label="Glass etter snitt">
            {ranked.slice(0, 10).map(({ rank, row }) => (
              <li key={row.item_id} className="rank-row big" data-testid="skjerm-topp">
                <span className="rank-n">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}</span>
                <span className="rank-name"><strong>{row.correct_label ?? `Glass ${row.position}`}</strong> <span className="soft small">· glass {row.position}</span></span>
                <span className="rank-pts"><strong>{formatScore(row.avg_score, 2)}</strong></span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          {offices.length > 0 && (<><h2>Kontorene</h2>{offices.map((o) => <p key={o.office_id} className="skjerm-label" style={{ margin: '2px 0' }}><strong>{o.name}</strong> snitt {formatScore(o.avg_score, 2)} · {formatPercent(o.hit_rate)} riktige</p>)}</>)}
          {people.length > 0 && (
            <>
              <h2>Beste gjettere</h2>
              <ol className="rank-list compact" data-testid="skjerm-gjettere">
                {people.slice(0, 5).map(({ rank, row }, i) => (
                  <li key={i} className="rank-row big"><span className="rank-n">{rank}</span><span className="rank-name"><strong>{row.name}</strong> <span className="soft small">· {row.office_name}</span></span><span className="rank-pts"><strong>{row.hits}</strong> <span className="soft small">av {row.guesses}</span></span></li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
      {q && (
        <blockquote className="quote skjerm-sitat" key={qi} data-testid="skjerm-kommentar">«{q.comment}»
          <div className="who">{q.featured ? '⭐ Dagens sitat · ' : ''}{q.display_name ?? 'Anonym'} · {q.office_name}</div>
        </blockquote>
      )}
    </div>
  )
}
