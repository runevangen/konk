import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { quizAnswer, quizClose, quizJoin, quizSkip, quizStart, type QuizState } from '../../api/quiz'
import { errorMessage } from '../../api/functions'
import { useAuth } from '../../auth'
import { Loading } from '../../components/ui'
import { Countdown, LETTERS, OfficeBoard, PlayersList, RankList } from '../../components/quiz/parts'
import { isCode, joinErrorText, medal, normalizeCode, placeOf, secondsLeft } from '../../lib/quiz'
import { useQuizRoom } from './useQuizRoom'

/** Ett rom, sett fra en spiller eller verten: lobby, spørsmål, fasit og sluttresultat. */
export default function QuizRoom() {
  const { kode = '' } = useParams()
  const code = normalizeCode(kode)
  const nav = useNavigate()
  const { profile } = useAuth()
  const room = useQuizRoom(isCode(code) ? code : '')
  const { state, error, remaining } = room
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [joinFail, setJoinFail] = useState<string | null>(null)
  const joining = useRef(false)
  const chosen = useRef<{ nr: number; choice: number } | null>(null)

  useEffect(() => { document.title = `Quiz ${code} – Konkurranser` }, [code])

  // Kom du rett inn på en rom-adresse uten å være med, prøver vi å bli med (bare i lobbyen).
  useEffect(() => {
    if (state?.error !== 'not_member' || joining.current || joinFail) return
    joining.current = true
    quizJoin(code)
      .then((r) => { if ('ok' in r) void room.refresh(); else setJoinFail(joinErrorText(r.error)) })
      .catch((e) => setJoinFail(errorMessage(e)))
      .finally(() => { joining.current = false })
  }, [state?.error, code, joinFail, room])

  if (!isCode(code)) return <Notice title="Ugyldig romkode">Koden er fire bokstaver.</Notice>
  if (joinFail) return <Notice title="Kunne ikke bli med">{joinFail}</Notice>
  if (state?.error === 'not_found') return <Notice title="Fant ikke rommet">Koden stemmer ikke, eller rommet er avsluttet.</Notice>
  if (!state && error) return <Notice title="Kunne ikke hente rommet">{errorMessage(error)}</Notice>
  if (!state || state.error === 'not_member') return <Loading text="Kobler til rommet …" />
  if (state.error === 'question_missing') return <Notice title="Spørsmålet mangler">Et spørsmål er fjernet fra banken. Be verten avslutte rommet.</Notice>

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true); setMsg(null)
    try { await fn(); after?.() } catch (e) { setMsg(errorMessage(e)) }
    await room.refresh()
    setBusy(false)
  }
  async function pick(i: number) {
    if (!state || state.nr === undefined || busy) return
    chosen.current = { nr: state.nr, choice: i }
    await act(() => quizAnswer(code, state.nr!, i))
  }

  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Quiz</h1>
        <span className="badge open" aria-label={`Romkode ${code}`}>{code}</span>
      </div>
      {msg && <div className="on-bg-error" role="alert">{msg}</div>}

      {state.status === 'lobby' && <Lobby state={state} code={code} />}
      {state.status === 'playing' && (
        <Playing state={state} remaining={remaining} chosen={chosen.current && chosen.current.nr === state.nr ? chosen.current.choice : null} onPick={pick} busy={busy} />
      )}
      {state.status === 'finished' && <Finished state={state} />}

      {state.is_host && (
        <HostBar state={state} code={code} busy={busy}
          onStart={() => act(() => quizStart(code))}
          onSkip={() => act(() => quizSkip(code))}
          onClose={() => { if (confirm('Avslutte og slette rommet? Alle spillerne mister resultatet.')) void act(() => quizClose(code), () => nav('/quiz')) }} />
      )}
      {!state.is_host && state.status === 'finished' && (
        <p><Link className="btn gold" to="/">Til forsiden</Link></p>
      )}
      {profile && !state.is_player && !state.is_host && <p className="muted-on-bg small">Du følger rommet uten å spille.</p>}
    </>
  )
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card"><h1>{title}</h1><p>{children}</p><Link className="btn" to="/quiz">Til quiz</Link></div>
}

function Lobby({ state, code }: { state: QuizState; code: string }) {
  const n = state.players.length
  return (
    <>
      <div className="card">
        <p className="soft" style={{ margin: 0 }}>Romkode</p>
        <div className="quiz-code" data-testid="quiz-kode">{code}</div>
        <p className="soft small" style={{ margin: 0 }}>
          {state.is_host ? 'Del koden, eller åpne storskjermen så alle ser den. Start når alle er med.' : 'Venter på at verten starter …'}
        </p>
        <p className="soft small">{state.n_questions} spørsmål · {state.seconds} sekunder per spørsmål{state.theme ? ` · ${state.theme}` : ''}</p>
      </div>
      <div className="card">
        <h2>Spillere ({n})</h2>
        <PlayersList players={state.players} />
      </div>
    </>
  )
}

function Playing({ state, remaining, chosen, onPick, busy }: { state: QuizState; remaining: number; chosen: number | null; onPick: (i: number) => void; busy: boolean }) {
  const answerPhase = state.phase === 'answer'
  const options = state.options ?? []
  const mine = state.mine
  const total = answerPhase ? state.reveal_seconds : state.seconds
  const last = (state.nr ?? 0) + 1 >= state.n_questions
  return (
    <>
      <div className="card">
        <p className="soft small" style={{ margin: '0 0 6px' }}>Spørsmål {(state.nr ?? 0) + 1} av {state.n_questions}</p>
        <Countdown remaining={remaining} totalSeconds={total} label={answerPhase ? (last ? 'Sluttresultat om' : 'Neste spørsmål om') : 'Tid igjen'} />
        <h2 style={{ margin: '14px 0 0', color: 'var(--ink)' }} data-testid="quiz-sporsmal">{state.question}</h2>
        <div className="quiz-opts" role="group" aria-label="Svaralternativer">
          {options.map((o, i) => {
            const isCorrect = answerPhase && i === state.correct_index
            const isWrong = answerPhase && mine && mine.choice === i && !mine.correct
            const isChosen = !answerPhase && chosen === i
            const locked = answerPhase || !!state.answered || !state.is_player || busy
            return (
              <button key={i} type="button" disabled={locked} onClick={() => onPick(i)}
                className={`quiz-opt ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''} ${isChosen ? 'chosen' : ''} ${answerPhase && !isCorrect && !isWrong ? 'dim' : ''}`}
                aria-pressed={isChosen || undefined} data-testid="quiz-valg" data-state={isCorrect ? 'riktig' : isWrong ? 'feil' : isChosen ? 'valgt' : ''}>
                <span className="letter" aria-hidden="true">{LETTERS[i]}</span><span>{o}</span>
              </button>
            )
          })}
        </div>
        {!answerPhase && state.is_player && !state.answered && <p className="soft small" style={{ margin: 0 }}>Trykk på svaret ditt. Raskt og riktig gir flest poeng.</p>}
        {!answerPhase && state.answered && (
          <p role="status" style={{ margin: 0 }} data-testid="quiz-sendt"><strong>Svar sendt ✓</strong> <span className="soft small">· {state.n_answered} av {state.n_players} har svart</span></p>
        )}
        {!answerPhase && !state.is_player && <p className="soft small" style={{ margin: 0 }}>{state.n_answered} av {state.n_players} har svart.</p>}
        {answerPhase && state.is_player && mine && (
          <div role="status" data-testid="quiz-resultat">
            <p style={{ margin: '6px 0' }}>
              {mine.choice < 0 ? <strong>Du rakk ikke å svare.</strong> : mine.correct ? <strong>Riktig! 🎉</strong> : <strong>Feil denne gangen.</strong>}{' '}
              <span className="quiz-points">+{mine.points}</span> <span className="soft small">poeng</span>
            </p>
          </div>
        )}
        {answerPhase && state.explanation && <p className="soft" style={{ margin: '6px 0 0' }} data-testid="quiz-forklaring">{state.explanation}</p>}
      </div>
      {answerPhase && state.ranking && (
        <div className="card">
          <h2>Stillingen så langt</h2>
          <RankList rows={state.ranking} limit={5} />
          {state.offices && <OfficeBoard offices={state.offices} />}
        </div>
      )}
    </>
  )
}

function Finished({ state }: { state: QuizState }) {
  const rows = state.ranking ?? []
  const me = placeOf(rows)
  return (
    <>
      <div className="card" data-testid="quiz-ferdig">
        <h2>Ferdig! 🎄</h2>
        {me ? (
          <p style={{ fontSize: '1.2rem', margin: '4px 0' }}>
            Du ble nr. <strong>{me.rank}</strong> {medal(me.rank) !== String(me.rank) ? medal(me.rank) : ''} av {me.of} med <strong>{me.row.points}</strong> poeng og {me.row.correct} av {state.n_questions} riktige.
          </p>
        ) : <p>Runden er ferdig.</p>}
      </div>
      <div className="card">
        <h2>Sluttresultat</h2>
        <RankList rows={rows} />
      </div>
      {state.offices && (
        <div className="card">
          <h2>Kontorene</h2>
          <OfficeBoard offices={state.offices} />
        </div>
      )}
    </>
  )
}

function HostBar({ state, code, busy, onStart, onSkip, onClose }: { state: QuizState; code: string; busy: boolean; onStart: () => void; onSkip: () => void; onClose: () => void }) {
  const players = state.players.length
  return (
    <div className="card-alt" aria-label="Vertens kontroller">
      <h2 style={{ marginTop: 0 }}>Du er vert</h2>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {state.status === 'lobby' && (
          <button className="btn green" disabled={busy || players < 2} onClick={onStart}>Start quizen</button>
        )}
        {state.status === 'playing' && (
          <button className="btn gold" disabled={busy} onClick={onSkip}>{state.phase === 'question' ? 'Vis fasit nå' : 'Hopp til neste'}</button>
        )}
        <a className="btn ghost small" href={`/quiz/${code}/skjerm`} target="_blank" rel="noreferrer">Åpne storskjerm</a>
        <button className="btn ghost small" disabled={busy} onClick={onClose}>Avslutt og slett rommet</button>
      </div>
      {state.status === 'lobby' && players < 2 && <p className="soft small" style={{ marginBottom: 0 }}>Vent til minst to spillere er med.</p>}
      {state.status === 'playing' && <p className="soft small" style={{ marginBottom: 0 }}>{secondsLeftNote(state)}</p>}
    </div>
  )
}
const secondsLeftNote = (s: QuizState) => (s.phase === 'question' ? `${s.n_answered ?? 0} av ${s.n_players ?? 0} har svart.` : `Neste om ${secondsLeft(s.left_ms ?? 0)} s.`)
