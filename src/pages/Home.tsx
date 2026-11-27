import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isCode, normalizeCode } from '../lib/quiz'
import { countItems, deleteCompetition, getQuizOnHome, setQuizOnHome, regenCompetitionCode, setCompetitionCode, listCompetitions, myProgress, saveCompetitionOrder, setCompetitionVisible } from '../api/data'
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
  const quizOn = useAsync(getQuizOnHome, [])
  const showQuiz = quizOn.data ?? quizOn.error != null   // ikke vis (og skjul så) mens vi venter; feiler oppslaget, vises den
  const nav = useNavigate()
  const [kode, setKode] = useState('')
  const goKode = (e: FormEvent) => { e.preventDefault(); if (isCode(kode)) nav(`/kode/${kode}`) }
  const [manage, setManage] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [editCode, setEditCode] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [codeErr, setCodeErr] = useState<string | null>(null)
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
    void run(() => setCompetitionVisible(id, visible), visible ? 'Konkurransen er synlig for alle.' : 'Konkurransen er nå skjult fra forsiden. Den er bare tilgjengelig med kode.')
  }
  const setCode = (id: string, code: string) => { setData((data ?? []).map((r) => (r.c.id === id ? { ...r, c: { ...r.c, code } } : r))) }
  async function saveCode(id: string) {
    setCodeErr(null)
    if (!isCode(codeInput)) { setCodeErr('Koden må være fire bokstaver (A–Z).'); return }
    try {
      const r = await setCompetitionCode(id, codeInput)
      if ('ok' in r) { setCode(id, r.code); setEditCode(null); setMsg({ ok: true, text: `Koden er nå ${r.code}.` }) }
      else setCodeErr(r.error === 'in_use' ? 'Den koden er i bruk. Velg en annen.' : r.error === 'invalid' ? 'Koden må være fire bokstaver (A–Z).' : 'Fant ikke konkurransen.')
    } catch (e) { setCodeErr(errorMessage(e)) }
  }
  async function randomCode(id: string) {
    setCodeErr(null)
    try { const c = await regenCompetitionCode(id); setCode(id, c); setEditCode(null); setMsg({ ok: true, text: `Ny kode: ${c}.` }) } catch (e) { setCodeErr(errorMessage(e)) }
  }
  const remove = (id: string, title: string) => {
    void run(async () => { await deleteCompetition(id); setData((data ?? []).filter((r) => r.c.id !== id)); setConfirmId(null); setTyped('') }, `«${title}» er slettet.`)
  }
  return (
    <>
      <h1>God jul{profile ? `, ${profile.display_name}` : ''}!</h1>
      <form className="card" onSubmit={goKode} aria-label="Bli med med kode">
        <h2 style={{ marginTop: 0 }}>Har du en kode?</h2>
        <div className="row" style={{ gap: 8 }}>
          <input className="pin" type="text" inputMode="text" autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} maxLength={4}
            aria-label="Kode til en konkurranse eller quiz" placeholder="ABCD" value={kode} onChange={(e) => setKode(normalizeCode(e.target.value))}
            style={{ letterSpacing: '.3em', textAlign: 'center', fontWeight: 700, flex: 1 }} data-testid="kodefelt" />
          <button className="btn green" disabled={!isCode(kode)}>Gå</button>
        </div>
        <p className="soft small" style={{ margin: '6px 0 0' }}>Koden står på skjermen. Den gir deg en konkurranse eller en quiz.</p>
      </form>
      {(showQuiz || isAdmin) && (
        <div className={`card ${quizOn.data === false ? 'dim' : ''}`} data-testid="quiz-kort">
          {isAdmin && quizOn.data === false && <p className="badge" style={{ marginTop: 0 }} data-testid="quiz-skjult-merke">Skjult for andre</p>}
          <h2>🎯 Quiz</h2>
          <p className="soft">Party-quiz med romkode: svar raskt og riktig mot kollegene.</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn gold" to="/quiz">Bli med i quiz</Link>
            {profile?.is_admin && <Link className="btn ghost" to="/quiz/ny">Lag quiz-rom</Link>}
          </div>
          {isAdmin && (
            <div className="admin-rad" style={{ margin: '12px 0 0', paddingBottom: 0, borderBottom: 0 }}>
              <button className="btn ghost small" aria-pressed={quizOn.data !== false} data-testid="quiz-bryter"
                onClick={() => { const next = quizOn.data === false; quizOn.setData(next); void run(() => setQuizOnHome(next), next ? 'Quiz vises på forsiden for alle.' : 'Quiz er skjult fra forsiden. Den virker fortsatt med kode.') .then(() => quizOn.reload()) }}>
                {quizOn.data === false ? '🚫 Skjult på forsiden' : '👁 Vises på forsiden'}
              </button>
            </div>
          )}
        </div>
      )}
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
          {isAdmin && !c.visible && <p className="badge" style={{ marginTop: 0 }} data-testid="usynlig-merke">Bare med kode</p>}
          {isAdmin && (
            <div className="admin-rad" data-testid="admin-rad">
              {editCode === c.id ? (
                <div className="kode-editor">
                  <label className="field" htmlFor={`kode-${c.id}`} style={{ margin: 0 }}>Romkode (fire bokstaver)</label>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <input id={`kode-${c.id}`} className="pin" value={codeInput} onChange={(e) => setCodeInput(normalizeCode(e.target.value))} maxLength={4} autoCapitalize="characters" autoComplete="off" spellCheck={false}
                      style={{ letterSpacing: '.3em', textAlign: 'center', fontWeight: 700, width: '8em' }} />
                    <button className="btn green small" onClick={() => void saveCode(c.id)} disabled={!isCode(codeInput)}>Lagre</button>
                    <button className="btn ghost small" onClick={() => void randomCode(c.id)}>🎲 Tilfeldig</button>
                    <button className="btn ghost small" onClick={() => { setEditCode(null); setCodeErr(null) }}>Avbryt</button>
                  </div>
                  {codeErr && <p className="error" role="alert" style={{ margin: '6px 0 0' }}>{codeErr}</p>}
                </div>
              ) : (
                <>
                  <span className="badge" title="Romkode" data-testid="romkode">Kode {c.code}</span>
                  <button className="btn ghost small" onClick={() => { setEditCode(c.id); setCodeInput(c.code); setCodeErr(null) }}>✏️ Endre kode</button>
                  <Link className="btn ghost small" to={`/k/${c.slug}/skjerm`} target="_blank" rel="noreferrer" data-testid="storskjerm-lenke">📺 Storskjerm</Link>
                </>
              )}
            </div>
          )}
          {isAdmin && manage && (
            <div className="manage-bar" role="group" aria-label={`Administrer ${c.title}`}>
              <button className="btn ghost small" onClick={() => move(c.id, -1)} disabled={idx === 0} aria-label={`Flytt ${c.title} opp`}>▲</button>
              <button className="btn ghost small" onClick={() => move(c.id, 1)} disabled={idx === data.length - 1} aria-label={`Flytt ${c.title} ned`}>▼</button>
              <button className="btn ghost small" onClick={() => toggleVisible(c.id, !c.visible)} aria-pressed={c.visible}>{c.visible ? '👁 Synlig' : '🔑 Bare med kode'}</button>
              <button className="btn ghost small danger" onClick={() => { setConfirmId(confirmId === c.id ? null : c.id); setTyped('') }}>🗑 Slett</button>
            </div>
          )}
          {isAdmin && manage && confirmId === c.id && (
            <div className="confirm-box" role="alertdialog" aria-label={`Slett ${c.title}`}>
              <p style={{ margin: '0 0 8px' }}><strong>Slette «{c.title}» for alltid?</strong> Alle glass, fasit, svar og kommentarer forsvinner, og det kan ikke angres. Vil du bare skjule den fra forsiden, velg «Bare med kode».</p>
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
          </Link>
          <p style={{ margin: '14px 0 0' }}>
            <Link className="btn gold block" to={c.status === 'closed' ? `/k/${c.slug}/resultat` : done > 0 ? `/k/${c.slug}/mine` : `/k/${c.slug}`} data-testid="hovedhandling">
              {c.status === 'closed' ? '🏆 Se resultatene' : done > 0 ? '✏️ Se og endre svarene dine' : '🥂 Begynn å smake'}
            </Link>
          </p>
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
