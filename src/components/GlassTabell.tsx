import { useEffect, useMemo, useState } from 'react'
import { addOption, deleteItem, listAnswers, listItems, listOptions, saveItem, setAnswer } from '../api/data'
import type { Competition, GuessOption, Id, Item } from '../api/types'
import { useAsync } from '../hooks'
import { fasitText, newOptionNames, normalizeName, parseFasitList } from '../lib/fasit'
import { Loading } from './ui'

type Run = (f: () => Promise<unknown>) => Promise<void>
interface Draft { label: string; pos: string; ans: Id | '' }

function readHide(): boolean {
  try { return localStorage.getItem('konk-skjul-fasit') === '1' } catch { return false }
}
function writeHide(v: boolean) {
  try { localStorage.setItem('konk-skjul-fasit', v ? '1' : '0') } catch { /* ikke viktig */ }
}

/** Hele glasslista og fasiten i én tabell, med «Lagre alle», innliming av hele lista, skjul fasit og fasitliste. */
export default function GlassTabell({ comp, run }: { comp: Competition; run: Run }) {
  const data = useAsync(async () => {
    const [items, options] = await Promise.all([listItems(comp.id), listOptions(comp.id)])
    const answers = await listAnswers(items.map((i) => i.id))
    return {
      items: [...items].sort((a, b) => a.position - b.position) as Item[],
      options: options as GuessOption[],
      answers: Object.fromEntries(answers.map((a) => [a.item_id, a.correct_option_id])) as Record<Id, Id>,
    }
  }, [comp.id])

  const items = data.data?.items
  const options = data.data?.options
  const answers = data.data?.answers

  const [drafts, setDrafts] = useState<Record<Id, Draft>>({})
  const [hide, setHide] = useState(readHide)
  const [msg, setMsg] = useState<string | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [paste, setPaste] = useState('')
  const [addUnknown, setAddUnknown] = useState(true)
  const [showList, setShowList] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!items || !answers) return
    setDrafts(Object.fromEntries(items.map((i) => [i.id, { label: i.label, pos: String(i.position), ans: answers[i.id] ?? '' }])))
  }, [items, answers])

  const optionLabels = useMemo(() => (options ?? []).map((o) => o.label), [options])
  const parsed = useMemo(() => parseFasitList(paste, optionLabels), [paste, optionLabels])

  if (data.loading && !data.data) return <Loading />
  if (!items || !options || !answers) return null

  const draftOf = (i: Item): Draft => drafts[i.id] ?? { label: i.label, pos: String(i.position), ans: answers[i.id] ?? '' }
  const isDirty = (i: Item) => {
    const d = draftOf(i)
    return d.label.trim() !== i.label || (Number(d.pos) || i.position) !== i.position || d.ans !== (answers[i.id] ?? '')
  }
  const dirty = items.filter(isDirty)
  const nextPos = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 1
  const optionName = (id: Id | '') => options.find((o) => o.id === id)?.label ?? null

  function setDraft(id: Id, patch: Partial<Draft>) {
    setMsg(null)
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? { label: '', pos: '', ans: '' }), ...patch } }))
  }

  async function saveAll() {
    if (!items || !dirty.length) return
    const posChanged = dirty.filter((i) => (Number(draftOf(i).pos) || i.position) !== i.position)
    const positions = items.map((i) => Number(draftOf(i).pos) || i.position)
    if (new Set(positions).size !== positions.length) { setMsg('To glass har samme posisjon. Rett det under Avansert.'); return }
    setBusy(true); setMsg(null)
    await run(async () => {
      // Posisjon er unik per konkurranse: flytt først til midlertidige verdier, så til endelige, så bytte går an.
      for (const [k, i] of posChanged.entries()) {
        await saveItem({ id: i.id, competition_id: i.competition_id, label: i.label, position: 10000 + k })
      }
      for (const i of dirty) {
        const d = draftOf(i)
        await saveItem({ id: i.id, competition_id: i.competition_id, label: d.label.trim() || i.label, position: Number(d.pos) || i.position })
        if (d.ans !== (answers?.[i.id] ?? '')) await setAnswer(i.id, d.ans || null)
      }
      setMsg(`Lagret ${dirty.length} ${dirty.length === 1 ? 'glass' : 'glass'}.`)
      await data.reload()
    })
    setBusy(false)
  }

  function resetDrafts() {
    if (!items || !answers) return
    setMsg(null)
    setDrafts(Object.fromEntries(items.map((i) => [i.id, { label: i.label, pos: String(i.position), ans: answers[i.id] ?? '' }])))
  }

  async function addGlass() {
    setBusy(true); setMsg(null)
    await run(async () => { await saveItem({ competition_id: comp.id, label: `Glass ${nextPos}`, position: nextPos }); await data.reload() })
    setBusy(false)
  }

  async function removeGlass(i: Item) {
    if (!confirm(`Slette glass ${i.position}? Alle svar på glasset forsvinner.`)) return
    setBusy(true); setMsg(null)
    await run(async () => { await deleteItem(i.id); await data.reload() })
    setBusy(false)
  }

  const unknown = parsed.filter((r) => r.isNew)
  const hasAnswers = items.some((i) => answers[i.id])
  const canApply = parsed.length > 0 && (unknown.length === 0 || addUnknown)
  const beyond = items.filter((i) => i.position > parsed.length)

  async function applyList() {
    if (!items || !options || !canApply) return
    if (hasAnswers && !confirm(`Dette setter fasiten for glass 1–${parsed.length} fra lista og overskriver det som står. Fortsette?`)) return
    setBusy(true); setMsg(null)
    await run(async () => {
      const names = newOptionNames(parsed)
      for (const n of names) await addOption(comp.id, n)
      const options2 = names.length ? await listOptions(comp.id) : options
      const idByName = new Map(options2.map((o) => [normalizeName(o.label), o.id]))
      const missing = parsed.filter((r) => !items.some((i) => i.position === r.pos))
      for (const r of missing) await saveItem({ competition_id: comp.id, label: `Glass ${r.pos}`, position: r.pos })
      const items2 = missing.length ? await listItems(comp.id) : items
      let set = 0
      for (const r of parsed) {
        const it = items2.find((i) => i.position === r.pos)
        const id = idByName.get(normalizeName(r.match ?? r.name))
        if (it && id) { await setAnswer(it.id, id); set++ }
      }
      setMsg(`Fasiten er satt for ${set} glass${names.length ? `, og ${names.length} nye brus ble lagt til i gjettelisten` : ''}${missing.length ? `. ${missing.length} nye glass ble opprettet` : ''}.`)
      setPaste(''); setShowPaste(false)
      await data.reload()
    })
    setBusy(false)
  }

  const listRows = items.map((i) => ({ pos: i.position, brus: optionName(answers[i.id] ?? '') }))
  async function copyList() {
    try { await navigator.clipboard.writeText(fasitText(listRows)); setMsg('Fasitlista er kopiert.') }
    catch { setMsg('Kunne ikke kopiere. Marker teksten selv.') }
  }

  return (
    <>
      {msg && <div className="card-alt" role="status">{msg}</div>}

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Glass og fasit ({items.length})</h2>
          <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={hide} onChange={(e) => { setHide(e.target.checked); writeHide(e.target.checked) }} />
            Skjul fasit
          </label>
        </div>
        {hide && <p className="soft small" style={{ margin: '8px 0 0' }}>Fasiten er skjult, for eksempel mens du deler skjerm. Slå av for å endre.</p>}

        {items.length === 0 ? (
          <p className="soft">Ingen glass ennå. Lim inn en liste under, eller legg til ett glass.</p>
        ) : (
          <table className="t glass-tabell" aria-label="Glass og fasit">
            <thead><tr><th>Glass</th><th>Fasit</th><th><span className="sr-only">Slett</span></th></tr></thead>
            <tbody>
              {items.map((i) => {
                const d = draftOf(i)
                const dirtyRow = isDirty(i)
                return (
                  <tr key={i.id} data-testid="glass-rad" data-dirty={dirtyRow ? '1' : '0'}>
                    <td>
                      <strong>Glass {Number(d.pos) || i.position}</strong>
                      {d.label.trim() && d.label.trim() !== `Glass ${Number(d.pos) || i.position}` && <div className="soft small">{d.label}</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {hide ? (
                          <span aria-label="Fasit er skjult" style={{ letterSpacing: 2 }}>{d.ans ? '••••••' : <span className="soft small">ikke satt</span>}</span>
                        ) : (
                          <select aria-label={`Fasit for glass ${Number(d.pos) || i.position}`} value={d.ans} onChange={(e) => setDraft(i.id, { ans: e.target.value })}>
                            <option value="">Ikke satt</option>
                            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                        )}
                        {dirtyRow && <span className="soft" aria-label="Ulagret endring" title="Ulagret endring">●</span>}
                      </div>
                    </td>
                    <td><button className="btn ghost small" aria-label={`Slett glass ${i.position}`} disabled={busy} onClick={() => void removeGlass(i)}>✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button className="btn" disabled={busy || dirty.length === 0 || hide} onClick={() => void saveAll()}>
            {dirty.length ? `Lagre alle (${dirty.length} ${dirty.length === 1 ? 'endring' : 'endringer'})` : 'Lagre alle'}
          </button>
          {dirty.length > 0 && <button className="btn ghost small" disabled={busy} onClick={resetDrafts}>Angre endringer</button>}
          <button className="btn ghost small" disabled={busy} onClick={() => void addGlass()}>+ Legg til glass</button>
          <button className="btn ghost small" aria-expanded={showPaste} onClick={() => setShowPaste((v) => !v)}>Lim inn liste</button>
        </div>
        {hide && dirty.length > 0 && <p className="soft small" style={{ marginBottom: 0 }}>Slå av «Skjul fasit» for å lagre endringene.</p>}
      </div>

      {showPaste && (
        <div className="card">
          <h2>Lim inn hele lista</h2>
          <p className="soft small">Én brus per linje, i den rekkefølgen glassene står (første linje er glass 1). Nummerering og merknader i parentes, som «(N)», fjernes. Du får se en forhåndsvisning før noe lagres.</p>
          <label className="field" htmlFor="fasit-liste">Lista</label>
          <textarea id="fasit-liste" rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Hamar\nAskim\nRingnes'} style={{ minHeight: 140 }} />
          {parsed.length > 0 && (
            <>
              <table className="t" aria-label="Forhåndsvisning" style={{ marginTop: 10 }}>
                <thead><tr><th>Glass</th><th>Brus</th><th>Status</th></tr></thead>
                <tbody>
                  {parsed.map((r) => (
                    <tr key={r.pos} data-testid="forhandsvisning-rad">
                      <td>Glass {r.pos}</td>
                      <td><strong>{r.match ?? r.name}</strong></td>
                      <td className="small">
                        {r.isNew ? <span className="error">Ny, ikke i gjettelisten</span> : <span>OK</span>}
                        {r.duplicate && <div className="error">Står på flere glass</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {unknown.length > 0 && (
                <label className="toggle" style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={addUnknown} onChange={(e) => setAddUnknown(e.target.checked)} />
                  <span><strong>Legg til {newOptionNames(parsed).length === 1 ? 'det nye brusnavnet' : `de ${newOptionNames(parsed).length} nye brusnavnene`} i gjettelisten</strong><br />
                    <span className="soft small">Ellers kan ikke lista brukes. Sjekk stavemåten først.</span></span>
                </label>
              )}
              {beyond.length > 0 && <p className="soft small">{beyond.length} glass utover lista ({beyond.map((i) => i.position).join(', ')}) endres ikke.</p>}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" disabled={busy || !canApply} onClick={() => void applyList()}>Bruk lista ({parsed.length} glass)</button>
                <button className="btn ghost small" onClick={() => { setPaste(''); setShowPaste(false) }}>Avbryt</button>
              </div>
            </>
          )}
        </div>
      )}

      <details className="card" open={showList} onToggle={(e) => setShowList((e.target as HTMLDetailsElement).open)}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Fasitliste (for den som heller opp)</summary>
        {hide ? (
          <p className="soft">Fasiten er skjult. Slå av «Skjul fasit» for å se lista.</p>
        ) : (
          <>
            <ol className="fasit-liste" style={{ listStyle: 'none', padding: 0, margin: '12px 0' }} data-testid="fasitliste">
              {listRows.map((r) => (
                <li key={r.pos} style={{ fontSize: '1.6rem', lineHeight: 1.5, fontFamily: 'Georgia, serif' }}>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>Glass {r.pos}</span>{': '}
                  <strong>{r.brus ?? '–'}</strong>
                </li>
              ))}
            </ol>
            <button className="btn small" onClick={() => void copyList()}>Kopier som tekst</button>
          </>
        )}
      </details>

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Avansert: navn og posisjon</summary>
        <p className="soft small">Vanligvis trengs ikke dette. Posisjonen styrer rekkefølgen glassene vises i for deltakerne. Husk å trykke «Lagre alle» etterpå.</p>
        <table className="t" aria-label="Navn og posisjon">
          <thead><tr><th>Navn</th><th>Posisjon</th></tr></thead>
          <tbody>
            {items.map((i) => {
              const d = draftOf(i)
              return (
                <tr key={i.id}>
                  <td><input type="text" aria-label={`Navn på glass ${i.position}`} value={d.label} onChange={(e) => setDraft(i.id, { label: e.target.value })} /></td>
                  <td><input type="number" min={1} aria-label={`Posisjon for glass ${i.position}`} value={d.pos} onChange={(e) => setDraft(i.id, { pos: e.target.value })} style={{ maxWidth: 90 }} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </>
  )
}
