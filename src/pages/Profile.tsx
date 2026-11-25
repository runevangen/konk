import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { listOffices, updateProfile } from '../api/data'
import { changePin, errorMessage } from '../api/functions'
import { ApiError } from '../api/client'
import { useAuth } from '../auth'
import { useAsync } from '../hooks'
import { isValidPin, isWeakPin, normalizePin, validateDisplayName } from '../lib/validation'

export default function ProfilePage() {
  const { profile, session, refreshProfile, signOut } = useAuth()
  const offices = useAsync(listOffices, [])
  const [name, setName] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pinBusy, setPinBusy] = useState(false)

  useEffect(() => { if (profile) { setName(profile.display_name); setAnonymous(profile.anonymous) } }, [profile])
  const officeName = offices.data?.find((o) => o.id === profile?.office_id)?.name

  async function save(e: FormEvent) {
    e.preventDefault()
    const err = validateDisplayName(name)
    if (err) { setMsg({ ok: false, text: err }); return }
    if (!session) return
    setBusy(true); setMsg(null)
    try {
      await updateProfile(session.user.id, { display_name: name.trim(), anonymous })
      await refreshProfile()
      setMsg({ ok: true, text: 'Lagret.' })
    } catch (e2) { setMsg({ ok: false, text: errorMessage(e2) }) }
    setBusy(false)
  }
  async function savePin(e: FormEvent) {
    e.preventDefault()
    if (!isValidPin(oldPin)) { setPinMsg({ ok: false, text: 'Skriv inn nåværende pinkode (6 siffer).' }); return }
    if (!isValidPin(newPin)) { setPinMsg({ ok: false, text: 'Den nye pinkoden må ha 6 siffer.' }); return }
    if (isWeakPin(newPin)) { setPinMsg({ ok: false, text: errorMessage(new ApiError('weak_pin')) }); return }
    if (newPin !== newPin2) { setPinMsg({ ok: false, text: 'De to nye kodene er ikke like.' }); return }
    if (newPin === oldPin) { setPinMsg({ ok: false, text: errorMessage(new ApiError('same_pin')) }); return }
    setPinBusy(true); setPinMsg(null)
    try {
      await changePin(oldPin, newPin)
      setOldPin(''); setNewPin(''); setNewPin2('')
      setPinMsg({ ok: true, text: 'Pinkoden er byttet. Bruk den nye koden neste gang du logger inn.' })
    } catch (err) {
      const wrongOld = err instanceof ApiError && err.code === 'invalid_pin'
      setPinMsg({ ok: false, text: wrongOld ? 'Feil nåværende pinkode.' : errorMessage(err) })
      if (wrongOld) setOldPin('')
    }
    setPinBusy(false)
  }
  async function out() { await signOut(); nav('/login', { replace: true }) }

  return (
    <>
      <h1>Profil</h1>
      <form className="card" onSubmit={save} noValidate>
        <label className="field">Visningsnavn
          <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="soft small">Kontor: {officeName ?? '–'}</p>
        <label className="toggle">
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          <span><strong>Vær anonym</strong><br /><span className="soft small">Navnet ditt skjules ved kommentarer og tilbakemeldinger.</span></span>
        </label>
        {msg && <p className={msg.ok ? 'soft' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        <button className="btn block" disabled={busy}>{busy ? 'Lagrer …' : 'Lagre'}</button>
      </form>
      <form className="card" onSubmit={savePin} noValidate>
        <h2>Bytt pinkode</h2>
        <p className="soft small">Velg en ny kode med 6 siffer som du husker. Unngå samme siffer (111111) og rekker (123456).</p>
        <label className="field" htmlFor="old-pin">Nåværende pinkode</label>
        <input id="old-pin" className="pin" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="current-password" maxLength={9}
          value={oldPin} onChange={(e) => setOldPin(normalizePin(e.target.value))} />
        <label className="field" htmlFor="new-pin" style={{ marginTop: 12 }}>Ny pinkode</label>
        <input id="new-pin" className="pin" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="new-password" maxLength={9}
          value={newPin} onChange={(e) => setNewPin(normalizePin(e.target.value))} />
        <label className="field" htmlFor="new-pin2" style={{ marginTop: 12 }}>Gjenta ny pinkode</label>
        <input id="new-pin2" className="pin" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="new-password" maxLength={9}
          value={newPin2} onChange={(e) => setNewPin2(normalizePin(e.target.value))} />
        {pinMsg && <p className={pinMsg.ok ? 'soft' : 'error'} role={pinMsg.ok ? 'status' : 'alert'}>{pinMsg.text}</p>}
        <button className="btn block" style={{ marginTop: 14 }} disabled={pinBusy || oldPin.length !== 6 || newPin.length !== 6 || newPin2.length !== 6}>
          {pinBusy ? 'Bytter …' : 'Bytt pinkode'}
        </button>
        <p className="soft small" style={{ marginBottom: 0 }}>Har du glemt koden, må en admin nullstille den.</p>
      </form>
      <div className="card">
        <button className="btn ghost block" onClick={out}>Logg ut</button>
      </div>
    </>
  )
}
