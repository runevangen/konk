import { useState } from 'react'
import { Link } from 'react-router-dom'
import { countItems, deleteCompetition, listCompetitions, myProgress, saveCompetitionOrder, setCompetitionVisible } from '../api/data'
import { errorMessage } from '../api/functions'
import { moveInOrder } from '../lib/competitionOrder'
import type { Competition } from '../api/types'
import { useAuth } from '../auth'
import { ErrorBox, Loading, Progress, StatusBadge } from '../components/ui'
import { useAsync } from '../hooks'

interface Row { c: Competition; done: number; total: number }

async function load(): Promise<Row[]> {
  const comps = await listCompetitions(false)
  return Promise.all(comps.map(async (c) => {
    const [done, total] = await Promise.all([myProgress(c.id).catch(() => 0), countItems(c.id).catch(() => 0)])
    return { c, done, total }
  }))
}

export default function Home() {
  const { profile } = useAuth()
  const { data, error, loading, reload, setData } = useAsync(load, [])
  const isAdmin = !!profile?.is_admin
  const [manage, setManage] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function run(fn: () => Promise<void>, okText?: string) {
    setMsg(null)
    try { await fn(); if (okText) setMsg({ ok: true, text: okText }) } catch (e) { setMsg({ ok: false, text: errorMessage(e) }); await reload() }
  }
  const move = (id: string, dir: -1 | 1) => {
    if (!data) return
    const { list, changes } = moveInOrder(data.map((r) => r.c), id, dir)
    if (!changes.length) return
    const byId = new Map(data.map((r) => [r.c.id, r]))
    setData(list.map((c) => ({ ...byId.get(c.id)!, c })))   // vis ny rekkefølge med en gang
    void run(() => saveCompetitionOrder(changes))
  }
  const toggleVisible = (id: string, visible: boolean) => {
    if (!data) return
    setData(data.map((r) => (r.c.id === id ? { ...r, c: { ...r.c, visible } } : r)))
    void run(() => setCompetitionVisible(id, visible), visible ? 'Konkurransen er synlig for alle.' : 'Konkurransen er skjult for alle andre enn deg.')
  }
  const remove = (id: string, title: string) => {
    void run(async () => { await deleteCompetition(id); setData((data ?? []).filter((r) => r.c.id !== id)); setConfirmId(null); setTyped('') }, `«${title}» er slettet.`)
  }
  return (
    <>
      <h1>God jul{profile ? `, ${profile.display_name}` : ''}!</h1>
      <div className="card">
        <h2>🎯 Quiz</h2>
        <p className="soft">Party-quiz med romkode: svar raskt og riktig mot kollegene.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn gold" to="/quiz">Bli med i quiz</Link>
          {profile?.is_admin && <Link className="btn ghost" to="/quiz/ny">Lag quiz-rom</Link>}
        </div>
      </div>
      <div className="row between" style={{ margin: '0 0 8px' }}>
        <p className="muted-on-bg" style={{ margin: 0 }}>Velg en konkurranse.</p>
        {isAdmin && <button className={`btn small ${manage ? 'gold' : 'ghost'}`} onClick={() => { setManage((m) => !m); setConfirmId(null); setTyped(''); setMsg(null) }} aria-pressed={manage} data-testid="administrer">{manage ? 'Ferdig' : '⚙️ Administrer'}</button>}
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'muted-on-bg' : 'on-bg-error'} data-testid="forside-melding" style={{ fontWeight: 700 }}>{msg.text}</p>}
      {loading && <Loading />}
      {error != null && <ErrorBox error={error} />}
      {data && data.length === 0 && <div className="card"><p>Ingen konkurranser er åpnet ennå. Kom tilbake snart.</p></div>}
      {data?.map(({ c, done, total }, idx) => (
        <div key={c.id} className={`card ${c.visible ? '' : 'dim'}`} data-testid="konkurranse-kort">
          {isAdmin && !c.visible && <p className="badge" style={{ marginTop: 0 }} data-testid="usynlig-merke">Usynlig for andre</p>}
          {isAdmin && manage && (
            <div className="manage-bar" role="group" aria-label={`Administrer ${c.title}`}>
              <button className="btn ghost small" onClick={() => move(c.id, -1)} disabled={idx === 0} aria-label={`Flytt ${c.title} opp`}>▲</button>
              <button className="btn ghost small" onClick={() => move(c.id, 1)} disabled={idx === data.length - 1} aria-label={`Flytt ${c.title} ned`}>▼</button>
              <button className="btn ghost small" onClick={() => toggleVisible(c.id, !c.visible)} aria-pressed={c.visible}>{c.visible ? '👁 Synlig' : '🚫 Usynlig'}</button>
              <button className="btn ghost small danger" onClick={() => { setConfirmId(confirmId === c.id ? null : c.id); setTyped('') }}>🗑 Slett</button>
            </div>
          )}
          {isAdmin && manage && confirmId === c.id && (
            <div className="confirm-box" role="alertdialog" aria-label={`Slett ${c.title}`}>
              <p style={{ margin: '0 0 8px' }}><strong>Slette «{c.title}» for alltid?</strong> Alle glass, fasit, svar og kommentarer forsvinner, og det kan ikke angres. Vil du bare skjule den, bruk «Usynlig».</p>
              <label className="field" htmlFor={`slett-${c.id}`}>Skriv SLETT for å bekrefte</label>
              <input id={`slett-${c.id}`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" />
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn ghost" onClick={() => { setConfirmId(null); setTyped('') }}>Avbryt</button>
                <button className="btn danger-solid" disabled={typed.trim().toUpperCase() !== 'SLETT'} onClick={() => remove(c.id, c.title)}>Slett for alltid</button>
              </div>
            </div>
          )}
          <Link to={c.status === 'closed' ? `/k/${c.slug}/resultat` : done > 0 ? `/k/${c.slug}/mine` : `/k/${c.slug}`} className="comp-link">
            <div className="row between">
              <h2 style={{ margin: 0 }}>{c.title}</h2>
              <StatusBadge status={c.status} />
            </div>
            {c.status === 'open' && (
              <div style={{ marginTop: 12 }}>
                <p className="soft small" style={{ margin: '0 0 6px' }}>{done} av {total} glass smakt</p>
                <Progress value={done} max={total} label={`Fremdrift ${c.title}`} />
              </div>
            )}
            <p className="small" style={{ margin: '10px 0 0', color: 'var(--red)', fontWeight: 700 }}>
              {c.status === 'closed' ? 'Se resultatene →' : done > 0 ? 'Se og endre svarene dine →' : 'Begynn å smake →'}
            </p>
          </Link>
          {c.live_board && c.status !== 'draft' && (
            <p style={{ margin: '14px 0 0' }}>
              <Link className="btn gold block" to={`/k/${c.slug}/tavle`}>📊 Se live tavle</Link>
            </p>
          )}
        </div>
      ))}
    </>
  )
}
