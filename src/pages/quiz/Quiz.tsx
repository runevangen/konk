import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { quizJoin, quizMyRooms } from '../../api/quiz'
import { errorMessage } from '../../api/functions'
import { useAuth } from '../../auth'
import { Loading } from '../../components/ui'
import { useAsync } from '../../hooks'
import { isCode, joinErrorText, normalizeCode } from '../../lib/quiz'

/** Inngangen til quizen: bli med med romkode, og (for admin) lag rom og se egne aktive rom. */
export default function Quiz() {
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [code, setCode] = useState(() => normalizeCode(params.get('kode') ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isAdmin = !!profile?.is_admin
  const rooms = useAsync(async () => (isAdmin ? await quizMyRooms() : []), [isAdmin])

  useEffect(() => { document.title = 'Quiz – Konkurranser' }, [])

  async function doJoin(c: string) {
    setBusy(true); setError(null)
    try {
      const r = await quizJoin(c)
      if ('ok' in r) { nav(`/quiz/${r.code}`, { replace: true }); return }
      setError(joinErrorText(r.error))
    } catch (err) { setError(errorMessage(err)) }
    setBusy(false)
  }

  // Kommer du fra en QR-kode eller lenke (?kode=ABCD), blir du med med en gang. Feiler det, står koden i feltet og feilen over.
  const auto = useRef(false)
  useEffect(() => {
    const k = normalizeCode(params.get('kode') ?? '')
    if (auto.current || !isCode(k)) return
    auto.current = true
    void doJoin(k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function join(e: FormEvent) {
    e.preventDefault()
    if (!isCode(code)) { setError('Romkoden er fire bokstaver.'); return }
    void doJoin(code)
  }

  return (
    <>
      <h1>Quiz</h1>
      <form className="card" onSubmit={join} noValidate>
        <h2>Bli med i en quiz</h2>
        <p className="soft">Skriv inn koden med fire bokstaver som verten viser.</p>
        <label className="field" htmlFor="quiz-kode">Romkode</label>
        <input id="quiz-kode" className="pin" type="text" inputMode="text" autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
          maxLength={8} value={code} onChange={(e) => setCode(normalizeCode(e.target.value))} aria-invalid={!!error} aria-describedby={error ? 'quiz-feil' : undefined}
          style={{ letterSpacing: '.3em', textAlign: 'center', fontWeight: 700 }} autoFocus />
        {error && <p id="quiz-feil" className="error" role="alert">{error}</p>}
        <button className="btn block" style={{ marginTop: 14 }} disabled={busy || code.length !== 4}>{busy ? 'Blir med …' : 'Bli med'}</button>
      </form>

      {isAdmin && (
        <div className="card">
          <h2>Lag quiz-rom</h2>
          <p className="soft">Du er admin og kan være vert: velg spørsmål, få en romkode og start når alle er med.</p>
          <Link className="btn green block" to="/quiz/ny">Lag nytt rom</Link>
          {rooms.loading && !rooms.data && <Loading />}
          {rooms.data && rooms.data.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Dine aktive rom</h3>
              <ul className="players">
                {rooms.data.map((r) => (
                  <li key={r.code} className="row between">
                    <span><strong>{r.code}</strong> <span className="soft small">· {r.status === 'lobby' ? 'venter' : 'pågår'} · {r.players} {r.players === 1 ? 'spiller' : 'spillere'}</span></span>
                    <Link className="btn ghost small" to={`/quiz/${r.code}`}>Åpne</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  )
}
