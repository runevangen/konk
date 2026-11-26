import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { applySession, errorMessage, login } from '../api/functions'
import { useAuth } from '../auth'
import { isValidPin, normalizePin } from '../lib/validation'

export default function Login() {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nav = useNavigate()
  const loc = useLocation()
  const { session } = useAuth()
  const from = (loc.state as { from?: string } | null)?.from ?? '/'

  useEffect(() => { if (session && !busy) nav(from, { replace: true }) }, [session, busy, from, nav])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Skriv inn navnet ditt.'); return }
    if (!isValidPin(pin)) { setError('Pinkoden har 6 siffer.'); return }
    setBusy(true); setError(null)
    try {
      const { session } = await login(name.trim(), pin)
      await applySession(session)
      nav(from, { replace: true })
    } catch (err) {
      setError(errorMessage(err)); setPin('')
    } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <h1>Logg inn</h1>
      <p className="soft">Skriv inn navnet ditt og din personlige pinkode med 6 siffer.</p>
      <form onSubmit={submit} noValidate>
        <label className="field" htmlFor="name">Navn</label>
        <input id="name" type="text" autoComplete="username" maxLength={40} value={name}
          onChange={(e) => setName(e.target.value)} autoFocus />
        <label className="field" htmlFor="pin" style={{ marginTop: 12 }}>Pinkode</label>
        <input id="pin" className="pin" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code"
          maxLength={9} value={pin} onChange={(e) => setPin(normalizePin(e.target.value))} aria-describedby={error ? 'pin-err' : undefined} aria-invalid={!!error} />
        {error && <p id="pin-err" className="error" role="alert">{error}</p>}
        <button className="btn block" style={{ marginTop: 14 }} disabled={busy || !name.trim() || pin.length !== 6}>{busy ? 'Logger inn …' : 'Logg inn'}</button>
      </form>
      <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '18px 0' }} />
      <p className="soft" style={{ marginBottom: 8 }}>Første gang her?</p>
      <Link className="btn green block" to="/registrer" state={{ from }}>Ny bruker</Link>
    </div>
  )
}
