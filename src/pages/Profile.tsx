import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { listOffices, updateProfile } from '../api/data'
import { errorMessage } from '../api/functions'
import { useAuth } from '../auth'
import { useAsync } from '../hooks'
import { validateDisplayName } from '../lib/validation'

export default function ProfilePage() {
  const { profile, session, refreshProfile, signOut } = useAuth()
  const offices = useAsync(listOffices, [])
  const [name, setName] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()

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
      <div className="card">
        <h2>Pinkode</h2>
        <p className="soft">Pinkoden vises bare én gang, når du registrerer deg. Har du mistet den, be en admin om å nullstille den.</p>
        <button className="btn ghost block" onClick={out}>Logg ut</button>
      </div>
    </>
  )
}
