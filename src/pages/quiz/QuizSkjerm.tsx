import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage } from '../../api/functions'
import { Loading } from '../../components/ui'
import { Qr } from '../../components/Qr'
import { Countdown, GiftCountdown, LETTERS, OfficeBoard, RankList } from '../../components/quiz/parts'
import { toppTittel } from '../../lib/format'
import { isCode, isOfficeTie, normalizeCode, officeWinner, ranked } from '../../lib/quiz'
import { useQuizRoom } from './useQuizRoom'

/** Flere enn dette får ikke plass på én projektor-skjerm; resten telles. */
const MAKS_NAVN = 14

/** Storskjerm for projektor: vises av verten. Viser aldri fasit før fasit-fasen (serveren sender den ikke). */
export default function QuizSkjerm() {
  const { kode = '' } = useParams()
  const code = normalizeCode(kode)
  const { state, error, remaining } = useQuizRoom(isCode(code) ? code : '', 1000)
  useEffect(() => { document.title = `Storskjerm ${code} – Konkurranser` }, [code])
  // Skjul toppraden på projektoren: den tar plass og er ikke til å trykke på der.
  useEffect(() => { document.body.classList.add('skjerm-modus'); return () => document.body.classList.remove('skjerm-modus') }, [])

  const wrap = (c: React.ReactNode) => <div className="skjerm" data-testid="skjerm">{c}</div>
  if (!isCode(code)) return wrap(<p>Ugyldig romkode.</p>)
  if (state?.error === 'not_found') return wrap(<><h1>Fant ikke rommet</h1><p>Koden stemmer ikke, eller rommet er avsluttet.</p><Link className="btn" to="/quiz">Til quiz</Link></>)
  if (state?.error === 'not_member') return wrap(<><h1>Bare verten kan vise storskjerm</h1><p>Logg inn som vert for rom {code}.</p><Link className="btn" to={`/quiz/${code}`}>Til rommet</Link></>)
  if (!state && error) return wrap(<p>{errorMessage(error)}</p>)
  if (!state) return wrap(<Loading text="Kobler til rommet …" />)
  if (!state.is_host) return wrap(<><h1>Bare verten kan vise storskjerm</h1><Link className="btn" to={`/quiz/${code}`}>Til rommet</Link></>)

  if (state.status === 'lobby') {
    return wrap(
      <>
        <h1>Bli med i quizen!</h1>
        <div className="skjerm-lobby">
          <div>
            <p className="skjerm-label">Gå til Quiz og skriv inn koden</p>
            <div className="skjerm-code" data-testid="skjerm-kode">{code}</div>
            <p className="skjerm-label">{state.n_questions} spørsmål · {state.seconds} sekunder hver</p>
          </div>
          <div className="skjerm-qrboks"><Qr code={code} path="/quiz?kode=" /><p className="skjerm-label"><strong>Skann for å bli med</strong></p></div>
        </div>
        <h2>Spillere ({state.players.length})</h2>
        <ul className="skjerm-spillere" data-testid="skjerm-spillere">
          {state.players.slice(0, MAKS_NAVN).map((p, i) => <li key={i}>{p.name} <span className="soft">· {p.office}</span></li>)}
          {state.players.length > MAKS_NAVN && <li className="skjerm-flere" data-testid="skjerm-flere">+{state.players.length - MAKS_NAVN} til</li>}
        </ul>
      </>,
    )
  }

  if (state.status === 'playing' && state.phase === 'countdown') {
    return wrap(<><h1>Gjør dere klare!</h1><GiftCountdown remaining={remaining} big /></>)
  }

  if (state.status === 'playing') {
    const answer = state.phase === 'answer'
    const total = answer ? state.reveal_seconds : state.seconds
    return wrap(
      <>
        <p className="skjerm-label">Spørsmål {(state.nr ?? 0) + 1} av {state.n_questions} · rom {code}</p>
        <Countdown remaining={remaining} totalSeconds={total} label={answer ? 'Neste om' : 'Tid igjen'} />
        <div className={answer ? 'skjerm-2k' : ''}>
          <div>
            <h1 className="skjerm-spm" data-testid="skjerm-sporsmal">{state.question}</h1>
            <div className="skjerm-valg">
              {(state.options ?? []).map((o, i) => (
                <div key={i} className={`skjerm-opt ${answer && i === state.correct_index ? 'correct' : ''} ${answer && i !== state.correct_index ? 'dim' : ''}`}
                  data-testid="skjerm-valg" data-state={answer && i === state.correct_index ? 'riktig' : ''}>
                  <span className="letter">{LETTERS[i]}</span><span>{o}</span>
                </div>
              ))}
            </div>
            {!answer && <p className="skjerm-label" data-testid="skjerm-svart">{state.n_answered ?? 0} av {state.n_players ?? 0} har svart</p>}
            {answer && state.explanation && <p className="skjerm-forklaring">{state.explanation}</p>}
          </div>
          {answer && state.ranking && (
            <div>
              <h2>{state.ranking && state.ranking.length > 10 ? 'Stillingen – topp 10' : 'Stillingen'}</h2>
              <RankList rows={state.ranking} limit={10} big compact hideMe />
              {state.offices && <OfficeBoard offices={state.offices} big />}
            </div>
          )}
        </div>
      </>,
    )
  }

  const rows = state.ranking ?? []
  const all = ranked(rows)
  const winners = all.filter((r) => r.rank === 1)
  const office = state.offices ? officeWinner(state.offices) : null
  return wrap(
    <>
      <p className="skjerm-label">Quizen er ferdig 🎄</p>
      <h1>{winners.length > 1 ? '🏆 Vinnerne er…' : '🏆 Vinneren er…'}</h1>
      <ol className="skjerm-pall" data-testid="skjerm-pall">
        {winners.map(({ row }, i) => (
          <li key={i} className="skjerm-vinner"><span className="skjerm-medalje">🥇</span><strong>{row.name}</strong> <span className="soft">· {row.office}</span><span className="skjerm-poeng">{row.points} p · {row.correct} riktige</span></li>
        ))}
      </ol>
      {office && !isOfficeTie(state.offices ?? []) && <p className="skjerm-label" data-testid="skjerm-kontorvinner">Beste kontor: <strong>{office.office}</strong> (høyest snitt per spiller)</p>}
      <div className="skjerm-bunn">
        <div><h2>{toppTittel(rows.length, 10, 'Sluttresultat')}</h2><RankList rows={rows} limit={10} big compact hideMe /></div>
        {state.offices && <div><h2>Kontorene</h2><OfficeBoard offices={state.offices} big /></div>}
      </div>
    </>,
  )
}
