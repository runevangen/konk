import { useEffect, useState, type FormEvent } from 'react'
import {
  addOption, deleteItem, deleteOption, listAllFeedback, listAnswers, listCommentEntries, listCompetitions, listItems, listOffices,
  listOptions, listProfiles, saveCompetition, saveItem, setAnswer, setEntryHidden, setFeedbackHidden,
} from '../api/data'
import { adminResetPin, errorMessage } from '../api/functions'
import type { Competition, CompetitionStatus, GuessOption, Id, Item, Profile } from '../api/types'
import { ErrorBox, Loading, StatusBadge } from '../components/ui'
import { useAsync } from '../hooks'
import { validateSlug } from '../lib/validation'

const TABS = ['Konkurranser', 'Glass og fasit', 'Gjetteliste', 'Brukere', 'Moderering'] as const
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
  const users = useAsync(async () => ({ profiles: await listProfiles(), offices: await listOffices() }), [])
  const [reset, setReset] = useState<{ user: Profile; pin: string } | null>(null)
  const [busyId, setBusyId] = useState<Id | null>(null)
  const { err, run } = useAction()
  if (users.loading && !users.data) return <Loading />
  async function doReset(p: Profile) {
    if (!confirm(`Nullstille pinkoden til ${p.display_name}? Den gamle slutter å virke.`)) return
    setBusyId(p.id)
    await run(async () => { const { pin } = await adminResetPin(p.id); setReset({ user: p, pin }) })
    setBusyId(null)
  }
  return (
    <>
      {err && <div className="on-bg-error" role="alert">{err}</div>}
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
        {users.data?.profiles.map((p) => (
          <div key={p.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span><strong>{p.display_name}</strong>{p.is_admin ? ' (admin)' : ''}<br />
              <span className="soft small">{users.data!.offices.find((o) => o.id === p.office_id)?.name ?? '–'}{p.anonymous ? ' · anonym' : ''}</span></span>
            <button className="btn ghost small" disabled={busyId === p.id} onClick={() => doReset(p)}>Reset pinkode</button>
          </div>
        ))}
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
