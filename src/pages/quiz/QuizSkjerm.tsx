import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errorMessage } from '../../api/functions'
import { Loading } from '../../components/ui'
import { Countdown, LETTERS, OfficeBoard, RankList } from '../../components/quiz/parts'
import { isCode, medal, normalizeCode, ranked } from '../../lib/quiz'
import { useQuizRoom } from './useQuizRoom'

/** QR som lenker til `/quiz?kode=ABCD`, tegnet lokalt (ingen eksterne kall). */
function Qr({ code }: { code: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let alive = true
    import('qrcode').then((m) => m.toString(`${location.origin}/quiz?kode=${code}`, { type: 'svg', margin: 1, width: 240 }))
      .then((s) => { if (alive) setSvg(s) }).catch(() => undefined)
    return () => { alive = false }
  }, [code])
  return <div className="skjerm-qr" data-testid="skjerm-qr" role="img" aria-label={`QR-kode for å bli med i rom ${code}`} dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Storskjerm for projektor: vises av verten. Viser aldri fasit før fasit-fasen (serveren sender den ikke). */
export default function QuizSkjerm() {
  const { kode = '' } = useParams()
  const code = normalizeCode(kode)
  const { state, error, remaining } = useQuizRoom(isCode(code) ? code : '', 1000)
  useEffect(() => { document.title = `Storskjerm ${code} – Konkurranser` }, [code])

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
          <Qr code={code} />
        </div>
        <h2>Spillere ({state.players.length})</h2>
        <ul className="skjerm-spillere" data-testid="skjerm-spillere">
          {state.players.map((p, i) => <li key={i}>{p.name} <span className="soft">· {p.office}</span></li>)}
        </ul>
      </>,
    )
  }

  if (state.status === 'playing') {
    const answer = state.phase === 'answer'
    const total = answer ? state.reveal_seconds : state.seconds
    return wrap(
      <>
        <p className="skjerm-label">Spørsmål {(state.nr ?? 0) + 1} av {state.n_questions} · rom {code}</p>
        <Countdown remaining={remaining} totalSeconds={total} label={answer ? 'Neste om' : 'Tid igjen'} />
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
        {answer && state.ranking && (
          <div className="skjerm-bunn">
            <div><h2>Topp 5</h2><RankList rows={state.ranking} limit={5} big /></div>
            {state.offices && <div><h2>Kontorene</h2><OfficeBoard offices={state.offices} big /></div>}
          </div>
        )}
      </>,
    )
  }

  const rows = state.ranking ?? []
  const top = ranked(rows).slice(0, 3)
  return wrap(
    <>
      <h1>Ferdig! 🎄</h1>
      <ol className="skjerm-pall" data-testid="skjerm-pall">
        {top.map(({ rank, row }, i) => (
          <li key={i}><span className="skjerm-medalje">{medal(rank)}</span><strong>{row.name}</strong> <span className="soft">· {row.office}</span><span className="skjerm-poeng">{row.points} p</span></li>
        ))}
      </ol>
      {state.offices && <OfficeBoard offices={state.offices} big />}
      <details className="skjerm-alle"><summary>Hele listen</summary><RankList rows={rows} big /></details>
    </>,
  )
}
