import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { quizCreate, quizThemes } from '../../api/quiz'
import { errorMessage } from '../../api/functions'
import { useAuth } from '../../auth'
import { ErrorBox, Loading } from '../../components/ui'
import { useAsync } from '../../hooks'

const SECONDS = [15, 20, 30, 45, 60]

/** Admin lager et rom: tema, antall spørsmål og tid. Verten kan spille selv eller bare styre. */
export default function QuizNew() {
  const { profile, loading } = useAuth()
  const nav = useNavigate()
  const themes = useAsync(quizThemes, [])
  const [theme, setTheme] = useState('')
  const [count, setCount] = useState(5)
  const [seconds, setSeconds] = useState(30)
  const [reveal, setReveal] = useState(7)
  const [hostPlays, setHostPlays] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (!theme && themes.data?.length) setTheme(themes.data[0].theme) }, [themes.data, theme])
  const available = themes.data?.find((t) => t.theme === theme)?.n ?? 0
  useEffect(() => { if (available && count > available) setCount(available) }, [available, count])

  if (loading) return <Loading />
  if (!profile?.is_admin) return <Navigate to="/quiz" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const r = await quizCreate({ theme: theme || null, count, seconds, reveal, hostPlays })
      nav(`/quiz/${r.code}`)
    } catch (err) { setError(errorMessage(err)); setBusy(false) }
  }

  return (
    <>
      <h1>Nytt quiz-rom</h1>
      {themes.error != null && <ErrorBox error={themes.error} />}
      {themes.loading && !themes.data && <Loading />}
      {themes.data && themes.data.length === 0 && (
        <div className="card"><p>Det finnes ingen synlige spørsmål ennå. Legg dem inn under Admin → Quiz-spørsmål.</p></div>
      )}
      {themes.data && themes.data.length > 0 && (
        <form className="card" onSubmit={submit} noValidate>
          <label className="field">Tema
            <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Tema">
              {themes.data.map((t) => <option key={t.theme} value={t.theme}>{t.theme} ({t.n} spørsmål)</option>)}
            </select>
          </label>
          <label className="field">Antall spørsmål (maks {Math.min(20, available)})
            <input type="number" min={1} max={Math.min(20, available)} value={count} onChange={(e) => setCount(Math.max(1, Math.min(Math.min(20, available) || 1, Number(e.target.value) || 1)))} aria-label="Antall spørsmål" />
          </label>
          <label className="field">Tid per spørsmål
            <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} aria-label="Tid per spørsmål">
              {SECONDS.map((s) => <option key={s} value={s}>{s} sekunder</option>)}
            </select>
          </label>
          <label className="field">Tid for fasit mellom spørsmålene
            <select value={reveal} onChange={(e) => setReveal(Number(e.target.value))} aria-label="Tid for fasit">
              {[5, 7, 10, 15].map((s) => <option key={s} value={s}>{s} sekunder</option>)}
            </select>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={hostPlays} onChange={(e) => setHostPlays(e.target.checked)} />
            <span><strong>Jeg spiller selv</strong><br /><span className="soft small">Av: du styrer bare runden (for eksempel fra storskjermen) og får ikke poeng.</span></span>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn block" disabled={busy || !theme}>{busy ? 'Lager rom …' : 'Lag rom'}</button>
        </form>
      )}
    </>
  )
}
