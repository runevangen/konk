import { useEffect, useState, type FormEvent } from 'react'
import {
  addOption, deleteAllAnswers, deleteEntry, deleteItem, deleteUserAnswers, listCompetitionEntries, deleteOption, listAllFeedback, listAnswers, listCommentEntries, listCompetitions, listItems, listOffices,
  listOptions, listProfiles, saveCompetition, saveItem, setAnswer, setEntryHidden, setFeedbackHidden,
} from '../api/data'
import { adminDeleteUser, adminResetPin, adminSetPin, errorMessage } from '../api/functions'
import { useAuth } from '../auth'
import type { Competition, CompetitionStatus, GuessOption, Id, Item, Profile } from '../api/types'
import { ErrorBox, Loading, StatusBadge } from '../components/ui'
import { useAsync } from '../hooks'
import { isValidPin, isWeakPin, normalizePin, validateSlug } from '../lib/validation'

const TABS = ['Konkurranser', 'Glass og fasit', 'Gjetteliste', 'Brukere', 'Svar', 'Moderering'] as const
type Tab = (typeof TABS)[number]

export default function Admin() {
  const [tab, setTab] = useState<Tab>('Konkurranser')
  const comps = useAsync(() => listCompetitions(true), [])
  const [compId, setCompId] = useState<Id>('')
  useEffect(() => { if (!compId && comps.data?.length) setCompId(comps.data[0].id) }, [comps.data, compId])
  const comp = comps.data?.find((c) => c.id === compId)

  return (
    <>
      <h1>Admin</h1>
      <div className="tabs" role="tablist" aria-label="Admin">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {comps.error != null && <ErrorBox error={comps.error} />}
      {tab !== 'Konkurranser' && tab !== 'Brukere' && comps.data && (
        <label className="field muted-on-bg">Konkurranse
          <select value={compId} onChange={(e) => setCompId(e.target.value)}>
            {comps.data.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
      )}
      {tab === 'Konkurranser' && <CompetitionsTab comps={comps.data ?? []} reload={comps.reload} />}
      {tab === 'Glass og fasit' && comp && <ItemsTab comp={comp} />}
      {tab === 'Gjetteliste' && comp && <OptionsTab comp={comp} />}
      {tab === 'Brukere' && <UsersTab />}
      {tab === 'Svar' && comp && <AnswersTab comp={comp} />}
      {tab === 'Moderering' && comp && <ModerationTab comp={comp} />}
    </>
  )
}

function useAction() {
  const [err, setErr] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn() } catch (e) { setErr(errorMessage(e)) } }
  return { err, run }
}

// ---------- Konkurranser ----------
function CompetitionsTab({ comps, reload }: { comps: Competition[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Partial<Competition> | null>(null)
  const { err, run } = useAction()
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const slugErr = validateSlug(editing.slug ?? '')
    if (slugErr || !editing.title?.trim()) { alert(slugErr ?? 'Tittel mangler'); return }
    await run(async () => {
      await saveCompetition({ id: editing.id, slug: editing.slug!, title: editing.title!.trim(), kind: editing.kind || 'brus', status: editing.status ?? 'draft', live_board: !!editing.live_board, live_board_names: !!editing.live_board_names })
      setEditing(null); await reload()
    })
  }
  return (
    <>
      {comps.map((c) => (
        <div className="card" key={c.id}>
          <div className="row between"><strong>{c.title}</strong><StatusBadge status={c.status} /></div>
          <p className="soft small">/{c.slug} · {c.kind}{c.live_board ? ' · live tavle på' : ''}</p>
          {c.live_board && c.status !== 'draft' && <p className="small"><a href={`/k/${c.slug}/tavle`}>Åpne live tavle →</a></p>}
          <button className="btn ghost small" onClick={() => setEditing(c)}>Rediger</button>
        </div>
      ))}
      {!editing && <button className="btn gold" onClick={() => setEditing({ status: 'draft', kind: 'brus', live_board: false, live_board_names: false })}>+ Ny konkurranse</button>}
      {editing && (
        <form className="card" onSubmit={submit}>
          <h2>{editing.id ? 'Rediger konkurranse' : 'Ny konkurranse'}</h2>
          <label className="field">Tittel<input type="text" value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
          <label className="field">Slug (adresse)<input type="text" value={editing.slug ?? ''} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></label>
          <label className="field">Type<input type="text" value={editing.kind ?? ''} onChange={(e) => setEditing({ ...editing, kind: e.target.value })} /></label>
          <label className="field">Status
            <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as CompetitionStatus })}>
              <option value="draft">Utkast (skjult)</option><option value="open">Åpen</option><option value="closed">Avsluttet (viser resultater)</option>
            </select>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={!!editing.live_board} onChange={(e) => setEditing({ ...editing, live_board: e.target.checked })} />
            <span><strong>Live tavle</strong><br /><span className="soft small">Deltakerne ser snittscore per glass underveis, samlet og per kontor. Ingen navn, kommentarer eller fasit. Snitt vises først når minst 2 har svart. Tips: slå av hvis du vil unngå at tavlen påvirker stemmene.</span></span>
          </label>
          {editing.live_board && (
            <label className="toggle">
              <input type="checkbox" checked={!!editing.live_board_names} onChange={(e) => setEditing({ ...editing, live_board_names: e.target.checked })} />
              <span><strong>Vis brusnavn på live tavlen</strong><br /><span className="soft small">Viser hvilken brus som ligger hvor. <strong>Det røper fasiten</strong> for de som ikke har gjettet ferdig, så bruk det helst når alle har smakt ferdig. Navnene vises alltid når konkurransen er avsluttet.</span></span>
            </label>
          )}
          {err && <p className="error" role="alert">{err}</p>}
          <div className="row"><button className="btn">Lagre</button><button type="button" className="btn ghost" onClick={() => setEditing(null)}>Avbryt</button></div>
        </form>
      )}
      {!editing && err && <div className="on-bg-error" role="alert">{err}</div>}
    </>
  )
}

// ---------- Glass og fasit ----------
function ItemsTab({ comp }: { comp: Competition }) {
  const data = useAsync(async () => {
    const [items, options] = await Promise.all([listItems(comp.id), listOptions(comp.id)])
    const answers = await listAnswers(items.map((i) => i.id))
    return { items, options, answers: Object.fromEntries(answers.map((a) => [a.item_id, a.correct_option_id])) as Record<Id, Id> }
  }, [comp.id])
  const { err, run } = useAction()
  const [label, setLabel] = useState('')
  const [pos, setPos] = useState('')
  if (data.loading && !data.data) return <Loading />
  const { items, options, answers } = data.data ?? { items: [], options: [], answers: {} as Record<Id, Id> }
  const nextPos = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 1
  return (
    <>
      {err && <div className="on-bg-error" role="alert">{err}</div>}
      {items.map((i) => <ItemRow key={i.id} item={i} options={options} answer={answers[i.id] ?? ''} run={run} reload={data.reload} />)}
      <form className="card-alt" onSubmit={(e) => { e.preventDefault(); void run(async () => {
        await saveItem({ competition_id: comp.id, label: label.trim(), position: Number(pos) || nextPos }); setLabel(''); setPos(''); await data.reload() }) }}>
        <h2>Legg til glass</h2>
        <label className="field">Navn/label<input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Glass ${nextPos}`} /></label>
        <label className="field">Posisjon<input type="number" min={1} value={pos} onChange={(e) => setPos(e.target.value)} placeholder={String(nextPos)} /></label>
        <button className="btn green" disabled={!label.trim()}>Legg til</button>
      </form>
    </>
  )
}
function ItemRow({ item, options, answer, run, reload }: { item: Item; options: GuessOption[]; answer: Id | ''; run: (f: () => Promise<unknown>) => Promise<void>; reload: () => Promise<void> }) {
  const [label, setLabel] = useState(item.label)
  const [pos, setPos] = useState(String(item.position))
  const [ans, setAns] = useState<Id | ''>(answer)
  return (
    <div className="card">
      <label className="field">Label<input type="text" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="field">Posisjon<input type="number" min={1} value={pos} onChange={(e) => setPos(e.target.value)} /></label>
      <label className="field">Fasit
        <select value={ans} onChange={(e) => setAns(e.target.value)}>
          <option value="">Ikke satt</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <div className="row">
        <button className="btn small" onClick={() => run(async () => {
          await saveItem({ id: item.id, competition_id: item.competition_id, label: label.trim(), position: Number(pos) || item.position })
          await setAnswer(item.id, ans || null); await reload() })}>Lagre</button>
        <button className="btn ghost small" onClick={() => { if (confirm(`Slette «${item.label}»? Alle svar på glasset forsvinner.`)) void run(async () => { await deleteItem(item.id); await reload() }) }}>Slett</button>
      </div>
    </div>
  )
}

// ---------- Gjetteliste ----------
function OptionsTab({ comp }: { comp: Competition }) {
  const opts = useAsync(() => listOptions(comp.id), [comp.id])
  const { err, run } = useAction()
  const [label, setLabel] = useState('')
  return (
    <>
      {err && <div className="on-bg-error" role="alert">{err}</div>}
      <div className="card">
        <h2>Gjetteliste</h2>
        {opts.data?.length === 0 && <p className="soft">Ingen alternativer ennå.</p>}
        {opts.data?.map((o) => (
          <div className="row between" key={o.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <span>{o.label}</span>
            <button className="btn ghost small" aria-label={`Slett ${o.label}`} onClick={() => run(async () => { await deleteOption(o.id); await opts.reload() })}>Slett</button>
          </div>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await addOption(comp.id, label.trim()); setLabel(''); await opts.reload() }) }} style={{ marginTop: 14 }}>
          <label className="field">Nytt alternativ<input type="text" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
          <button className="btn green" disabled={!label.trim()}>Legg til</button>
        </form>
      </div>
    </>
  )
}

// ---------- Brukere ----------
function UsersTab() {
  const { session } = useAuth()
  const selfId = session?.user.id
  const users = useAsync(async () => ({ profiles: await listProfiles(), offices: await listOffices() }), [])
  const [reset, setReset] = useState<{ user: Profile; pin: string } | null>(null)
  const [editing, setEditing] = useState<Id | null>(null)
  const [newPin, setNewPin] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<Id | null>(null)
  const [q, setQ] = useState('')
  const { err, run } = useAction()
  if (users.loading && !users.data) return <Loading />
  async function doReset(p: Profile) {
    if (!confirm(`Nullstille pinkoden til ${p.display_name}? Den gamle slutter å virke.`)) return
    setBusyId(p.id); setMsg(null)
    await run(async () => { const { pin } = await adminResetPin(p.id); setReset({ user: p, pin }); setEditing(null) })
    setBusyId(null)
  }
  async function doSetPin(p: Profile) {
    if (!isValidPin(newPin)) { setMsg('Pinkoden må ha 6 siffer.'); return }
    if (isWeakPin(newPin)) { setMsg('Velg en kode som er vanskeligere å gjette (ikke 111111 eller 123456).'); return }
    setBusyId(p.id); setMsg(null)
    await run(async () => { await adminSetPin(p.id, newPin); setMsg(`Ny pinkode er satt for ${p.display_name}. Gi koden videre til brukeren.`); setEditing(null); setNewPin('') })
    setBusyId(null)
  }
  async function doDelete(p: Profile) {
    if (!confirm(`Slette ${p.display_name}? Brukeren, alle svar og alle tilbakemeldinger fra brukeren slettes. Dette kan ikke angres.`)) return
    setBusyId(p.id); setMsg(null)
    await run(async () => { await adminDeleteUser(p.id); setMsg(`${p.display_name} er slettet.`); setEditing(null); await users.reload() })
    setBusyId(null)
  }
  const list = (users.data?.profiles ?? []).filter((p) => p.display_name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      {err && <div className="on-bg-error" role="alert">{err}</div>}
      {msg && <div className="card-alt" role="status">{msg}</div>}
      {reset && (
        <div className="card" role="alert">
          <h2>Ny pinkode til {reset.user.display_name}</h2>
          <p><strong>Vises kun nå.</strong> Gi koden videre til brukeren før du lukker.</p>
          <div className="pin-box"><div className="pin-code" data-testid="reset-pin">{reset.pin}</div></div>
          <button className="btn" onClick={() => setReset(null)}>Lukk (koden vises ikke igjen)</button>
        </div>
      )}
      <div className="card">
        <h2>Brukere ({users.data?.profiles.length ?? 0})</h2>
        <label className="field">Søk
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk på navn" autoComplete="off" />
        </label>
        {list.length === 0 && <p className="soft">Ingen brukere funnet.</p>}
        {list.map((p) => {
          const isSelf = p.id === selfId
          return (
            <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <span><strong>{p.display_name}</strong>{p.is_admin ? ' (admin)' : ''}{isSelf ? ' (deg)' : ''}<br />
                  <span className="soft small">{users.data!.offices.find((o) => o.id === p.office_id)?.name ?? '–'}{p.anonymous ? ' · anonym' : ''}</span></span>
                <span className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
                  <button className="btn ghost small" disabled={busyId === p.id} onClick={() => { setEditing(editing === p.id ? null : p.id); setNewPin(''); setMsg(null) }} aria-expanded={editing === p.id}>Sett pinkode</button>
                  <button className="btn ghost small" disabled={busyId === p.id} onClick={() => doReset(p)}>Ny tilfeldig</button>
                  {!isSelf && <button className="btn small" disabled={busyId === p.id} onClick={() => doDelete(p)}>Slett</button>}
                </span>
              </div>
              {editing === p.id && (
                <form style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); void doSetPin(p) }} noValidate>
                  <label className="field" htmlFor={`pin-${p.id}`}>Ny pinkode til {p.display_name} (6 siffer)</label>
                  <input id={`pin-${p.id}`} className="pin" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={9}
                    value={newPin} onChange={(e) => setNewPin(normalizePin(e.target.value))} />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn small" disabled={busyId === p.id || newPin.length !== 6}>Lagre pinkode</button>
                    <button type="button" className="btn ghost small" onClick={() => { setEditing(null); setNewPin('') }}>Avbryt</button>
                  </div>
                </form>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ---------- Moderering ----------
function ModerationTab({ comp }: { comp: Competition }) {
  const d = useAsync(async () => {
    const items = await listItems(comp.id)
    const [entries, feedback, profiles] = await Promise.all([listCommentEntries(items.map((i) => i.id)), listAllFeedback(comp.id), listProfiles()])
    return { items, entries, feedback, names: Object.fromEntries(profiles.map((p) => [p.id, p.display_name])) as Record<Id, string> }
  }, [comp.id])
  const { err, run } = useAction()
  if (d.loading && !d.data) return <Loading />
  if (!d.data) return null
  const { items, entries, feedback, names } = d.data
  const label = (id: Id | null) => (id ? items.find((i) => i.id === id)?.label ?? '?' : 'Konkurransen')
  const withComment = feedback.filter((f) => f.comment || f.emoji)
  return (
    <>
      {err && <div className="on-bg-error" role="alert">{err}</div>}
      <div className="card">
        <h2>Kommentarer ({entries.length})</h2>
        {entries.length === 0 && <p className="soft">Ingen kommentarer.</p>}
        {entries.map((e) => (
          <div key={e.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div className={e.hidden ? 'hidden-row' : ''} style={{ flex: 1, minWidth: 0 }}>
              {e.comment}<div className="soft small">{label(e.item_id)} · {names[e.user_id] ?? 'ukjent'} · score {e.score}</div>
            </div>
            <button className="btn ghost small" onClick={() => run(async () => { await setEntryHidden(e.id, !e.hidden); await d.reload() })}>{e.hidden ? 'Vis' : 'Skjul'}</button>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Tilbakemeldinger ({withComment.length})</h2>
        {withComment.length === 0 && <p className="soft">Ingen tilbakemeldinger.</p>}
        {withComment.map((f) => (
          <div key={f.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
            <div className={f.hidden ? 'hidden-row' : ''} style={{ flex: 1, minWidth: 0 }}>
              {f.emoji} {f.comment}<div className="soft small">{label(f.item_id)} · {names[f.user_id] ?? 'ukjent'}</div>
            </div>
            <button className="btn ghost small" onClick={() => run(async () => { await setFeedbackHidden(f.id, !f.hidden); await d.reload() })}>{f.hidden ? 'Vis' : 'Skjul'}</button>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------- Svar (slett) ----------
function AnswersTab({ comp }: { comp: Competition }) {
  const d = useAsync(async () => {
    const [items, options, profiles, offices] = await Promise.all([listItems(comp.id), listOptions(comp.id), listProfiles(), listOffices()])
    const entries = await listCompetitionEntries(items.map((i) => i.id))
    return { items, options, profiles, offices, entries }
  }, [comp.id])
  const [open, setOpen] = useState<Id | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState('')
  const { err, run } = useAction()
  if (d.loading && !d.data) return <Loading />
  if (!d.data) return null
  const { items, options, profiles, offices, entries } = d.data
  const itemLabel = (id: Id) => items.find((i) => i.id === id)?.label ?? '?'
  const optionLabel = (id: Id | null) => (id ? options.find((o) => o.id === id)?.label ?? '?' : '–')
  const byUser = new Map<Id, typeof entries>()
  for (const e of entries) byUser.set(e.user_id, [...(byUser.get(e.user_id) ?? []), e])
  const users = [...byUser.keys()].map((id) => profiles.find((p) => p.id === id) ?? ({ id, display_name: 'ukjent bruker', office_id: null, anonymous: false, is_admin: false } as Profile))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'nb'))
  const itemIds = items.map((i) => i.id)

  async function delOne(e: (typeof entries)[number], who: string) {
    if (!confirm(`Slette svaret fra ${who} på ${itemLabel(e.item_id)}? Dette kan ikke angres.`)) return
    await run(async () => { await deleteEntry(e.id); setMsg('Svaret er slettet.'); await d.reload() })
  }
  async function delUser(p: Profile) {
    if (!confirm(`Slette ALLE svar og tilbakemeldinger fra ${p.display_name} i ${comp.title}? Dette kan ikke angres.`)) return
    await run(async () => { const n = await deleteUserAnswers(p.id, comp.id, itemIds); setMsg(`Slettet ${n} svar fra ${p.display_name}.`); setOpen(null); await d.reload() })
  }
  async function delAll() {
    await run(async () => { const n = await deleteAllAnswers(comp.id, itemIds); setMsg(`Nullstilt: slettet ${n} svar og alle tilbakemeldinger.`); setConfirmAll(''); setOpen(null); await d.reload() })
  }

  return (
    <>
      {err && <div className="on-bg-error" role="alert">{err}</div>}
      {msg && <div className="card-alt" role="status">{msg}</div>}
      <div className="card">
        <h2>Svar i {comp.title} ({entries.length})</h2>
        <p className="soft small">Du kan slette enkeltsvar, alle svar fra én bruker, eller nullstille hele konkurransen. Sletting kan ikke angres, og snitt og tavle oppdateres med en gang.</p>
        {users.length === 0 && <p className="soft">Ingen har svart ennå.</p>}
        {users.map((p) => {
          const list = (byUser.get(p.id) ?? []).slice().sort((a, b) => (items.find((i) => i.id === a.item_id)?.position ?? 0) - (items.find((i) => i.id === b.item_id)?.position ?? 0))
          const isOpen = open === p.id
          return (
            <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="row between">
                <button className="btn ghost small" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)} style={{ textAlign: 'left' }}>
                  <strong>{p.display_name}</strong> · {offices.find((o) => o.id === p.office_id)?.name ?? '–'}{p.anonymous ? ' · anonym' : ''} · {list.length} svar {isOpen ? '▲' : '▼'}
                </button>
                <button className="btn small" onClick={() => delUser(p)}>Slett alle</button>
              </div>
              {isOpen && list.map((e) => (
                <div key={e.id} className="row between" style={{ padding: '6px 0 6px 12px', alignItems: 'flex-start' }}>
                  <div className="small" style={{ flex: 1, minWidth: 0 }}>
                    <strong>{itemLabel(e.item_id)}</strong>: score {e.score ?? '–'}, gjettet {optionLabel(e.guess_option_id)}
                    {e.comment ? <div className="soft">«{e.comment}»</div> : null}
                  </div>
                  <button className="btn ghost small" onClick={() => delOne(e, p.display_name)}>Slett</button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <div className="card">
        <h2>Nullstill konkurransen</h2>
        <p className="soft small">Sletter alle svar og alle tilbakemeldinger i {comp.title}. Glass, fasit, gjetteliste og brukere beholdes. Nyttig etter at du har testet. Skriv <strong>SLETT</strong> for å bekrefte.</p>
        <input type="text" aria-label="Skriv SLETT for å bekrefte" value={confirmAll} onChange={(e) => setConfirmAll(e.target.value)} placeholder="SLETT" />
        <button className="btn" style={{ marginTop: 10 }} disabled={confirmAll !== 'SLETT'} onClick={delAll}>Slett alle svar</button>
      </div>
    </>
  )
}
