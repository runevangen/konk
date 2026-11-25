import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { applySession, errorMessage, register } from '../api/functions'
import { listOffices } from '../api/data'
import { useAsync } from '../hooks'
import { ErrorBox, Loading } from '../components/ui'
import { validateDisplayName } from '../lib/validation'

/**
 * Pinkoden holdes KUN i komponent-state mens den vises. Den skrives aldri til
 * storage, URL eller router-state, og fjernes fra state når brukeren bekrefter.
 */
export default function Register() {
  const offices = useAsync(listOffices, [])
  const [name, setName] = useState('')
  const [officeId, setOfficeId] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)
  const nav = useNavigate()

  useEffect(() => {
    if (!pin) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [pin])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const nameErr = validateDisplayName(name)
    if (nameErr) { setError(nameErr); return }
    if (!officeId) { setError('Velg kontor.'); return }
    setBusy(true); setError(null)
    try {
      const res = await register({ display_name: name.trim(), office_id: officeId, anonymous })
      setPin(res.pin)
      await applySession(res.session)
    } catch (err) {
      setError(errorMessage(err))
    } finally { setBusy(false) }
  }

  async function copy() {
    if (!pin) return
    try { await navigator.clipboard.writeText(pin); setCopied('ok') } catch { setCopied('fail') }
  }
  function done() { setPin(null); nav('/', { replace: true }) }

  if (pin) {
    return (
      <div className="card">
        <h1>Din pinkode</h1>
        <p><strong>Dette er første og siste gang du ser koden.</strong> Du trenger den hver gang du logger inn. Lagre den nå, for eksempel i passordbehandleren eller et skjermbilde.</p>
        <div className="pin-box">
          <div className="pin-code" data-testid="pin" aria-label={`Pinkode: ${pin.split('').join(' ')}`}>{pin}</div>
          <button type="button" className="btn gold" onClick={copy}>Kopier pinkode</button>
          <p role="status" className="small soft" style={{ margin: '8px 0 0' }}>
            {copied === 'ok' && 'Kopiert til utklippstavlen.'}
            {copied === 'fail' && 'Kunne ikke kopiere. Marker koden og kopier manuelt.'}
          </p>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>Jeg har lagret pinkoden</span>
        </label>
        <button className="btn block" disabled={!saved} onClick={done}>Fortsett til Konk</button>
      </div>
    )
  }

  return (
    <div className="card">
      <h1>Ny bruker</h1>
      <form onSubmit={submit} noValidate>
        <label className="field">Navn
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} />
        </label>
        <label className="field">Kontor
          <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} disabled={offices.loading}>
            <option value="">Velg kontor …</option>
            {offices.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        {offices.loading && <Loading />}
        {offices.error != null && <ErrorBox error={offices.error} />}
        <label className="toggle">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          <span><strong>Vær anonym</strong><br /><span className="soft small">Navnet ditt vises ikke ved kommentarer. Poengene dine teller likevel.</span></span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn block" disabled={busy}>{busy ? 'Oppretter …' : 'Opprett bruker'}</button>
      </form>
      <p style={{ marginTop: 16 }}><Link to="/login">Har du allerede pinkode? Logg inn</Link></p>
    </div>
  )
}
