import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCompetition, getLiveBoard, getResults, listAnswers, listCompetitionEntries, listItems, listOptions, listProfiles, type AdminEntry } from '../api/data'
import { ApiError } from '../api/client'
import type { Competition, GuessOption, Item, LiveBoard, Profile, Results, ResultsItem } from '../api/types'
import { GlassPanel } from '../components/GlassPanel'
import { Qr } from '../components/Qr'
import { Loading } from '../components/ui'
import { formatPercent, formatScore, plassTekst, pluralize, rankBy, scoreBarWidth, toppTittel } from '../lib/format'
import { placeLabel } from '../lib/quiz'
import { tasteProfile } from '../lib/validation'

const POLL_MS = 4000
/** Koden og QR-koden står på skjermen så lenge; så skjules de, så de ikke ligger fremme hele kvelden. Admin kan vise dem igjen. */
export const KODE_MINUTTER = 10

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
  // Admin ser alle svar (RLS), så skjermen kan vise fordeling, gjetninger, smak og kommentarer per glass.
  const [admin, setAdmin] = useState<{ items: Item[]; entries: AdminEntry[]; options: GuessOption[]; answers: Record<string, string>; profiles: Profile[] } | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [visHemmelig, setVisHemmelig] = useState(false)
  const [kodeTil, setKodeTil] = useState(() => Date.now() + KODE_MINUTTER * 60000)
  const [naa, setNaa] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNaa(Date.now()), 10000); return () => clearInterval(t) }, [])
  const kodeSynlig = naa < kodeTil
  const kodeMinutter = Math.max(1, Math.ceil((kodeTil - naa) / 60000))

  useEffect(() => { void getCompetition(slug).then(setComp).catch(() => setComp(null)) }, [slug])
  useEffect(() => { document.title = `Storskjerm ${comp?.title ?? ''} – Konkurranser` }, [comp?.title])
  useEffect(() => { document.body.classList.add('skjerm-modus'); return () => document.body.classList.remove('skjerm-modus') }, [])

  const closed = comp?.status === 'closed'

  const loadAdmin = useCallback(async (id: string) => {
    try {
      const items = await listItems(id)
      const ids = items.map((i) => i.id)
      const [entries, options, answers, profiles] = await Promise.all([listCompetitionEntries(ids), listOptions(id), listAnswers(ids), listProfiles()])
      setAdmin({ items, entries, options, answers: Object.fromEntries(answers.map((a) => [a.item_id, a.correct_option_id])), profiles })
    } catch { /* uten admin-data vises bare det som tavlen alt har */ }
  }, [])
  const pollBoard = useCallback(async (id: string) => {
    try { setBoard(await getLiveBoard(id)); setLiveOff(false); setErr(null) } catch (e) {
      if (e instanceof ApiError && e.code === 'live_off') setLiveOff(true); else setErr('Fikk ikke hentet tavlen. Prøver igjen …')
    }
  }, [])
  useEffect(() => {
    if (!comp) return
    let stop = false
    const tick = () => { if (!stop && !document.hidden) { void pollBoard(comp.id); void loadAdmin(comp.id) } }
    tick()
    const t = setInterval(tick, closed ? 30000 : POLL_MS)
    return () => { stop = true; clearInterval(t) }
  }, [comp, closed, pollBoard, loadAdmin])
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
      if (e.key === 'Escape') { setSel(null); return }
      if ((e.target as HTMLElement | null)?.getAttribute?.('role') === 'button' && (e.key === 'Enter' || e.key === ' ')) return   // rader i oppsummeringen håndterer det selv
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); back() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [closed, next, back])

  const liveRows = useMemo(() => (board ? rankBy(board.items, (i) => i.avg_score) : []), [board])
  const visAlt = closed || visHemmelig || !!board?.names
  const officeName = (id: string | number | null) => board?.offices.find((o) => String(o.office_id) === String(id))?.name ?? results?.offices.find((o) => String(o.office_id) === String(id))?.name ?? ''
  const panelFor = (itemId: string, base: { delt?: boolean; position: number; label: string | null; rank: number | null; avg: number | null; n: number; hitRate: number | null; byOffice: { office_id: string | number; name: string; avg_score: number | null; n: number }[] }) => (
    <GlassPanel {...base} entries={(admin?.entries ?? []).filter((e) => e.item_id === itemId)} options={admin?.options ?? []} correctId={admin?.answers[itemId]}
      profiles={admin?.profiles ?? []} officeName={officeName} reveal={visAlt} canToggle={!closed} onToggle={() => setVisHemmelig((v) => !v)} onClose={() => setSel(null)} />
  )
  useEffect(() => {
    if (closed) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSel(null); return }
      if (!sel || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
      e.preventDefault()
      const i = liveRows.findIndex((r) => r.row.item_id === sel)
      const j = Math.min(liveRows.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)))
      if (liveRows[j]) setSel(liveRows[j].row.item_id)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [closed, sel, liveRows])

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
              <button key={row.item_id} type="button" className={`skjerm-bar klikkbar ${sel === row.item_id ? 'valgt' : ''}`} data-testid="skjerm-glass" aria-pressed={sel === row.item_id}
                onClick={() => setSel(sel === row.item_id ? null : row.item_id)}>
                <span className="skjerm-bar-label"><span className="skjerm-rank">{row.avg_score != null ? rank : '·'}</span>Glass {row.position}{(names || visAlt) && row.brus ? ` – ${row.brus}` : ''}</span>
                <span className="skjerm-bar-track" aria-hidden="true"><i style={{ width: `${scoreBarWidth(row.avg_score)}%` }} /></span>
                <strong className="skjerm-bar-val">{row.avg_score != null ? formatScore(row.avg_score, 2) : '–'}</strong>
              </button>
            ))}
            <p className="skjerm-label" style={{ fontSize: '.8em', opacity: .7 }}>Trykk på et glass for detaljer</p>
          </div>
          {sel && (() => {
            const hit = rows.find((r) => r.row.item_id === sel)
            return hit ? panelFor(sel, { delt: hit.row.avg_score != null && rows.filter((x) => x.rank === hit.rank && x.row.avg_score != null).length > 1, position: hit.row.position, label: admin ? (admin.options.find((o) => o.id === admin.answers[sel])?.label ?? null) : null, rank: hit.row.avg_score != null ? hit.rank : null, avg: hit.row.avg_score, n: hit.row.n, hitRate: hit.row.hit_rate, byOffice: hit.row.by_office }) : null
          })()}
          {!sel && <aside className="skjerm-side">
            {kodeSynlig ? (
              <>
                <div className="skjerm-qrboks"><Qr code={comp.code} /><p className="skjerm-label"><strong>Skann for å bli med</strong></p></div>
                <div className="skjerm-code skjerm-code-liten" data-testid="skjerm-kode">{comp.code}</div>
                <p className="skjerm-label" style={{ fontSize: '.8em', opacity: .7, margin: 0 }} data-testid="skjerm-kode-tid">Koden skjules om {kodeMinutter} min</p>
              </>
            ) : (
              <div className="skjerm-kode-skjult" data-testid="skjerm-kode-skjult">
                <p className="skjerm-label" style={{ margin: '0 0 8px' }}>🔒 Koden er skjult.</p>
                <button className="btn gold small" onClick={() => { setKodeTil(Date.now() + KODE_MINUTTER * 60000); setNaa(Date.now()) }} data-testid="vis-kode">Vis koden i {KODE_MINUTTER} min</button>
              </div>
            )}
            {board && (
              <>
                <p className="skjerm-label" data-testid="skjerm-deltakere">{pluralize(board.overall.participants, 'deltaker', 'deltakere')} · {pluralize(board.overall.n_entries, 'svar', 'svar')}</p>
                {board.offices.map((o) => (
                  <p key={o.office_id} className="skjerm-label" style={{ margin: 0 }} data-testid="skjerm-kontor">
                    <strong>{o.name}</strong>{' '}{o.participants > 0 && o.avg_score != null ? `snitt ${formatScore(o.avg_score, 2)} · ${pluralize(o.participants, 'deltaker', 'deltakere')}` : o.participants > 0 ? `${pluralize(o.participants, 'deltaker', 'deltakere')} · venter på svar` : 'ingen svar ennå'}
                  </p>
                ))}
              </>
            )}
            {err && <p className="skjerm-label">{err}</p>}
          </aside>}
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
    return wrap(<><RevealGlass rank={rank} row={row} comments={results.comments} isWinner={rank === 1} delt={ranked.filter((x) => x.rank === rank && x.row.item_id !== row.item_id).map((x) => x.row)} />{controls}</>)
  }
  return wrap(<><Summary results={results} ranked={ranked} board={liveOff ? null : board} sel={sel} onSel={setSel} panelFor={panelFor} /> {controls}</>)
}

function RevealGlass({ rank, row, comments, isWinner, delt }: { rank: number; row: ResultsItem; comments: Results['comments']; isWinner: boolean; delt: ResultsItem[] }) {
  const mine = comments.filter((c) => c.item_id === row.item_id)
  const quote = mine.find((c) => c.featured) ?? mine[0]
  const taste = tasteProfile(row.tags, row.n).slice(0, 4)
  return (
    <div className="skjerm-reveal" key={row.item_id} data-testid="skjerm-avslort">
      <p className="skjerm-label" data-testid="skjerm-plass">{isWinner ? `🏆 ${delt.length ? 'Delt førsteplass' : 'Vinneren'}` : plassTekst(rank, delt.length > 0)}</p>
      {delt.length > 0 && <p className="skjerm-label" data-testid="skjerm-delt-med" style={{ marginTop: 0 }}>Sammen med {delt.map((d) => `${d.correct_label ?? `Glass ${d.position}`} (glass ${d.position})`).join(' og ')}</p>}
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

type PanelBase = { delt?: boolean; position: number; label: string | null; rank: number | null; avg: number | null; n: number; hitRate: number | null; byOffice: { office_id: string | number; name: string; avg_score: number | null; n: number }[] }
function Summary({ results, ranked, board, sel, onSel, panelFor }: { results: Results; ranked: { rank: number; row: ResultsItem }[]; board: LiveBoard | null; sel: string | null; onSel: (id: string | null) => void; panelFor: (itemId: string, base: PanelBase) => React.ReactNode }) {
  const people = board ? rankBy(board.people.filter((p) => p.guesses > 0), (p) => p.hits).slice(0, 10) : []
  const offices = results.offices
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
          <h2>{toppTittel(ranked.length)}</h2>
          <ol className="rank-list compact" aria-label="Glass etter snitt">
            {ranked.slice(0, 10).map(({ rank, row }) => (
              <li key={row.item_id} className={`rank-row big klikkbar-rad ${sel === row.item_id ? 'valgt' : ''}`} data-testid="skjerm-topp" role="button" tabIndex={0} aria-pressed={sel === row.item_id}
                onClick={() => onSel(sel === row.item_id ? null : row.item_id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSel(sel === row.item_id ? null : row.item_id) } }}>
                <span className="rank-n">{placeLabel(rank)}</span>
                <span className="rank-name"><strong>{row.correct_label ?? `Glass ${row.position}`}</strong> <span className="soft small">· glass {row.position}</span>{ranked.filter((x) => x.rank === rank).length > 1 && <span className="delt-merke" data-testid="delt-merke">delt {rank}. plass</span>}</span>
                <span className="rank-pts"><strong>{formatScore(row.avg_score, 2)}</strong></span>
              </li>
            ))}
          </ol>
        </div>
        {sel && (() => {
          const hit = ranked.find((r) => r.row.item_id === sel)
          return hit ? panelFor(sel, { delt: ranked.filter((x) => x.rank === hit.rank).length > 1, position: hit.row.position, label: hit.row.correct_label, rank: hit.rank, avg: hit.row.avg_score, n: hit.row.n, hitRate: hit.row.hit_rate, byOffice: hit.row.by_office }) : null
        })()}
        {!sel && <div>
          {offices.length > 0 && (<><h2>Kontorene</h2>{offices.map((o) => <p key={o.office_id} className="skjerm-label" style={{ margin: '2px 0' }} data-testid="skjerm-kontor"><strong>{o.name}</strong>{' '}{o.participants > 0 ? `snitt ${formatScore(o.avg_score, 2)} · ${formatPercent(o.hit_rate)} riktige` : 'ingen svar'}</p>)}</>)}
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
        </div>}
      </div>
      {q && !sel && (
        <blockquote className="quote skjerm-sitat" key={qi} data-testid="skjerm-kommentar">«{q.comment}»
          <div className="who">{q.featured ? '⭐ Dagens sitat · ' : ''}{q.display_name ?? 'Anonym'} · {q.office_name}</div>
        </blockquote>
      )}
    </div>
  )
}
