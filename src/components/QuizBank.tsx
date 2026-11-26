import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteQuizQuestions, insertQuizQuestions, listQuizQuestions, setQuizHidden, updateQuizQuestion } from '../api/data'
import type { Id, QuizQuestion } from '../api/types'
import { useAuth } from '../auth'
import { useAsync } from '../hooks'
import { importable, LETTERS, markDuplicates, parseQuizText, questionKey, toExportJson, validateQuestion, type QuizQuestionInput } from '../lib/quizImport'
import { Loading } from './ui'

type Run = (f: () => Promise<unknown>) => Promise<void>

interface Form {
  id: Id | null; theme: string; category: string; difficulty: string; question: string
  options: [string, string, string, string]; correct: number; explanation: string; source: string; hidden: boolean
}
const emptyForm = (theme: string): Form => ({ id: null, theme, category: '', difficulty: '', question: '', options: ['', '', '', ''], correct: 0, explanation: '', source: '', hidden: false })
const toForm = (q: QuizQuestion): Form => ({
  id: q.id, theme: q.theme, category: q.category ?? '', difficulty: q.difficulty ?? '', question: q.question,
  options: [q.options[0] ?? '', q.options[1] ?? '', q.options[2] ?? '', q.options[3] ?? ''], correct: q.correct,
  explanation: q.explanation, source: q.source ?? '', hidden: q.hidden,
})
const toInput = (f: Form): QuizQuestionInput => ({
  theme: f.theme.trim(), category: f.category.trim() || null, difficulty: f.difficulty.trim() || null, question: f.question.trim(),
  options: f.options.map((o) => o.trim()) as [string, string, string, string], correct: f.correct as 0 | 1 | 2 | 3,
  explanation: f.explanation.trim(), source: f.source.trim() || null,
})

/** Spørsmålsbanken til quizen: liste, søk, redigering, import (JSON/CSV) og eksport. */
export default function QuizBank({ run }: { run: Run }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const data = useAsync(listQuizQuestions, [])
  const [q, setQ] = useState('')
  const [fTheme, setFTheme] = useState('')
  const [fCat, setFCat] = useState('')
  const [fHidden, setFHidden] = useState<'alle' | 'synlige' | 'skjulte'>('alle')
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [formErr, setFormErr] = useState<string[]>([])
  const [showImport, setShowImport] = useState(false)
  const [text, setText] = useState('')
  const [theme, setTheme] = useState('jul')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<Id | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const all = data.data
  useEffect(() => { setMsg(null) }, [q, fTheme, fCat, fHidden])

  const themes = useMemo(() => [...new Set((all ?? []).map((x) => x.theme))].sort(), [all])
  const cats = useMemo(() => [...new Set((all ?? []).map((x) => x.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'nb')), [all])
  const existingKeys = useMemo(() => new Set((all ?? []).map((x) => questionKey(x.theme, x.question))), [all])
  const parsed = useMemo(() => {
    const r = parseQuizText(text, theme)
    return { ...r, rows: markDuplicates(r.rows, existingKeys) }
  }, [text, theme, existingKeys])

  if (data.loading && !all) return <Loading />
  if (!all) return null

  const needle = q.trim().toLowerCase()
  const shown = all.filter((x) =>
    (!fTheme || x.theme === fTheme) && (!fCat || x.category === fCat) &&
    (fHidden === 'alle' || (fHidden === 'skjulte') === x.hidden) &&
    (!needle || x.question.toLowerCase().includes(needle) || x.options.some((o) => o.toLowerCase().includes(needle)) || (x.category ?? '').toLowerCase().includes(needle)))
  const visible = all.filter((x) => !x.hidden).length

  const good = importable(parsed.rows)
  const bad = parsed.rows.filter((r) => r.errors.length)
  const dupes = parsed.rows.filter((r) => r.duplicate)

  async function doImport() {
    if (!good.length) return
    setBusy(true); setMsg(null)
    await run(async () => {
      const res = await insertQuizQuestions(good.map((r) => ({ line: r.line, q: r.question! })), userId)
      const extra = res.failed.length ? ` ${res.failed.length} ble avvist: ${res.failed.map((f) => `rad ${f.line} (${f.message})`).join('; ')}.` : ''
      setMsg(`Importerte ${res.inserted} spørsmål.${extra}`)
      if (!res.failed.length) { setText(''); setShowImport(false) }
      await data.reload()
    })
    setBusy(false)
  }

  async function readFile(f: File | undefined) {
    if (!f) return
    const t = await f.text()
    setText(t); setShowImport(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function saveForm() {
    if (!form) return
    const input = toInput(form)
    const errs = validateQuestion(input)
    setFormErr(errs)
    if (errs.length) return
    setBusy(true); setMsg(null)
    await run(async () => {
      if (form.id) await updateQuizQuestion(form.id, { ...input, hidden: form.hidden })
      else {
        const res = await insertQuizQuestions([{ line: 1, q: input }], userId)
        if (res.failed.length) throw new Error(res.failed[0].message)
      }
      setMsg(form.id ? 'Spørsmålet er lagret.' : 'Spørsmålet er lagt til.')
      setForm(null); setFormErr([])
      await data.reload()
    })
    setBusy(false)
  }

  async function toggleHidden(x: QuizQuestion) {
    setBusy(true)
    await run(async () => { await setQuizHidden([x.id], !x.hidden); await data.reload() })
    setBusy(false)
  }
  async function remove(x: QuizQuestion) {
    if (!confirm(`Slette spørsmålet «${x.question.slice(0, 60)}»? Det kan ikke angres.`)) return
    setBusy(true)
    await run(async () => { await deleteQuizQuestions([x.id]); setMsg('Spørsmålet er slettet.'); await data.reload() })
    setBusy(false)
  }
  async function bulkHide(hide: boolean) {
    const ids = shown.filter((x) => x.hidden !== hide).map((x) => x.id)
    if (!ids.length) return
    if (!confirm(`${hide ? 'Skjule' : 'Vise'} ${ids.length} spørsmål?`)) return
    setBusy(true)
    await run(async () => { await setQuizHidden(ids, hide); setMsg(`${ids.length} spørsmål er ${hide ? 'skjult' : 'synlige'}.`); await data.reload() })
    setBusy(false)
  }
  function download() {
    const rows = shown.map((x) => ({ ...toInput(toForm(x)), hidden: x.hidden }))
    const blob = new Blob([toExportJson(rows)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'quiz-sporsmal.json'; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const setOpt = (i: number, v: string) => setForm((f) => (f ? { ...f, options: f.options.map((o, k) => (k === i ? v : o)) as Form['options'] } : f))

  return (
    <>
      {msg && <div className="card-alt" role="status">{msg}</div>}

      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Quiz-spørsmål ({all.length})</h2>
          <span className="soft small">{visible} synlige · {all.length - visible} skjulte</span>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={() => { setForm(emptyForm(fTheme || themes[0] || 'jul')); setFormErr([]); setShowImport(false) }}>+ Nytt spørsmål</button>
          <button className="btn ghost small" aria-expanded={showImport} onClick={() => { setShowImport((v) => !v); setForm(null) }}>Importer</button>
          <button className="btn ghost small" disabled={!shown.length} onClick={download}>Eksporter JSON ({shown.length})</button>
        </div>
        <label className="field" htmlFor="quiz-sok" style={{ marginTop: 12 }}>Søk</label>
        <input id="quiz-sok" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk i spørsmål, alternativer og kategori" autoComplete="off" />
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <label className="small">Tema<br /><select aria-label="Filter tema" value={fTheme} onChange={(e) => setFTheme(e.target.value)}><option value="">Alle</option>{themes.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="small">Kategori<br /><select aria-label="Filter kategori" value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Alle</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="small">Vis<br /><select aria-label="Filter skjult" value={fHidden} onChange={(e) => setFHidden(e.target.value as typeof fHidden)}><option value="alle">Alle</option><option value="synlige">Synlige</option><option value="skjulte">Skjulte</option></select></label>
        </div>
      </div>

      {showImport && (
        <div className="card">
          <h2>Importer spørsmål</h2>
          <p className="soft small">Lim inn JSON eller CSV, eller velg en fil. JSON: en liste med <code>spoersmaal</code>, <code>alternativer</code> (A–D), <code>riktig</code> (A–D), og valgfritt <code>kategori</code>, <code>vanskelighet</code>, <code>forklaring</code>, <code>kilde</code>. CSV: overskrift med <code>spørsmål;A;B;C;D;riktig</code> og valgfrie kolonner. Du ser en forhåndsvisning før noe lagres.</p>
          <label className="field" htmlFor="quiz-tema">Tema for importerte spørsmål (hvis filen ikke har tema)</label>
          <input id="quiz-tema" type="text" list="quiz-temaer" value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={40} />
          <datalist id="quiz-temaer">{themes.map((t) => <option key={t} value={t} />)}</datalist>
          <label className="field" htmlFor="quiz-tekst" style={{ marginTop: 12 }}>Innhold</label>
          <textarea id="quiz-tekst" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder='[{"spoersmaal": "…", "alternativer": {"A": "…", "B": "…", "C": "…", "D": "…"}, "riktig": "B"}]' style={{ minHeight: 140, fontFamily: 'monospace', fontSize: 16 }} />
          <div className="row" style={{ marginTop: 8 }}>
            <input ref={fileRef} type="file" accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/plain" aria-label="Velg fil" onChange={(e) => void readFile(e.target.files?.[0])} />
          </div>
          {parsed.fatal && <p className="error" role="alert">{parsed.fatal}</p>}
          {parsed.rows.length > 0 && (
            <>
              <p style={{ margin: '12px 0 6px' }} data-testid="import-oppsummering">
                <strong>{good.length}</strong> kan importeres{bad.length ? <> · <span className="error">{bad.length} med feil</span></> : null}{dupes.length ? <> · {dupes.length} dubletter hoppes over</> : null}
              </p>
              <table className="t" aria-label="Forhåndsvisning av import">
                <thead><tr><th>Rad</th><th>Spørsmål</th><th>Status</th></tr></thead>
                <tbody>
                  {parsed.rows.map((r) => (
                    <tr key={r.line} data-testid="import-rad" data-status={r.errors.length ? 'feil' : r.duplicate ? 'dublett' : 'ok'}>
                      <td>{r.line}</td>
                      <td>{r.label}{r.question && <div className="soft small">{[r.question.category, r.question.difficulty].filter(Boolean).join(' · ')} · riktig {LETTERS[r.question.correct]}: {r.question.options[r.question.correct]}</div>}</td>
                      <td className="small">
                        {r.errors.length ? <span className="error">{r.errors.map((e, i) => <div key={i}>{e}</div>)}</span>
                          : r.duplicate ? <span>{r.duplicate === 'bank' ? 'Finnes i banken' : 'Dublett i filen'}</span> : <span>OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" disabled={busy || !good.length} onClick={() => void doImport()}>Importer {good.length} spørsmål</button>
                <button className="btn ghost small" onClick={() => { setText(''); setShowImport(false) }}>Avbryt</button>
              </div>
            </>
          )}
        </div>
      )}

      {form && (
        <div className="card">
          <h2>{form.id ? 'Rediger spørsmål' : 'Nytt spørsmål'}</h2>
          <label className="field" htmlFor="qf-spm">Spørsmål</label>
          <textarea id="qf-spm" value={form.question} maxLength={300} onChange={(e) => setForm({ ...form, question: e.target.value })} style={{ minHeight: 80 }} />
          <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
            <legend className="small">Alternativer (velg det riktige)</legend>
            {form.options.map((o, i) => (
              <div key={i} className="row" style={{ gap: 8, margin: '6px 0', alignItems: 'center' }}>
                <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
                  <input type="radio" name="qf-riktig" aria-label={`Riktig er alternativ ${LETTERS[i]}`} checked={form.correct === i} onChange={() => setForm({ ...form, correct: i })} />
                  <strong>{LETTERS[i]}</strong>
                </label>
                <input type="text" aria-label={`Alternativ ${LETTERS[i]}`} value={o} maxLength={120} onChange={(e) => setOpt(i, e.target.value)} style={{ flex: 1 }} />
              </div>
            ))}
          </fieldset>
          <label className="field" htmlFor="qf-forkl" style={{ marginTop: 12 }}>Forklaring (vises i fasit-fasen)</label>
          <textarea id="qf-forkl" value={form.explanation} maxLength={500} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
          <label className="field" htmlFor="qf-kilde">Kilde (valgfri)</label>
          <input id="qf-kilde" type="text" value={form.source} maxLength={300} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <label className="small">Tema<br /><input type="text" list="quiz-temaer" value={form.theme} maxLength={40} onChange={(e) => setForm({ ...form, theme: e.target.value })} aria-label="Tema" /></label>
            <label className="small">Kategori<br /><input type="text" value={form.category} maxLength={40} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Kategori" /></label>
            <label className="small">Vanskelighet<br /><select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} aria-label="Vanskelighet"><option value="">–</option><option>Lett</option><option>Middels</option><option>Vanskelig</option></select></label>
          </div>
          {form.id && (
            <label className="toggle" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={form.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })} />
              <span><strong>Skjult</strong><br /><span className="soft small">Skjulte spørsmål brukes ikke når en runde trekkes.</span></span>
            </label>
          )}
          {formErr.length > 0 && <div className="error" role="alert">{formErr.map((e, i) => <div key={i}>{e}</div>)}</div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" disabled={busy} onClick={() => void saveForm()}>Lagre</button>
            <button className="btn ghost small" onClick={() => { setForm(null); setFormErr([]) }}>Avbryt</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>{shown.length === all.length ? 'Alle spørsmål' : `${shown.length} av ${all.length} spørsmål`}</h2>
          {shown.length > 0 && (
            <span className="row" style={{ gap: 8 }}>
              <button className="btn ghost small" disabled={busy} onClick={() => void bulkHide(true)}>Skjul alle viste</button>
              <button className="btn ghost small" disabled={busy} onClick={() => void bulkHide(false)}>Vis alle viste</button>
            </span>
          )}
        </div>
        {all.length === 0 && <p className="soft">Ingen spørsmål ennå. Bruk «Importer» eller «+ Nytt spørsmål».</p>}
        {all.length > 0 && shown.length === 0 && <p className="soft">Ingen spørsmål passer filteret.</p>}
        {shown.map((x) => (
          <div key={x.id} data-testid="quiz-rad" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
              <button className="btn ghost small" style={{ textAlign: 'left', flex: 1, justifyContent: 'flex-start', height: 'auto', padding: '8px 12px' }} aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)}>
                <span><strong>{x.question}</strong>{x.hidden && <span className="soft small"> · skjult</span>}
                  <span className="soft small" style={{ display: 'block' }}>{[x.theme, x.category, x.difficulty].filter(Boolean).join(' · ')}</span></span>
              </button>
            </div>
            {open === x.id && (
              <div style={{ margin: '10px 0 0 4px' }}>
                <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {x.options.map((o, i) => (
                    <li key={i} style={{ padding: '3px 0', fontWeight: i === x.correct ? 700 : 400, color: i === x.correct ? 'var(--green)' : undefined }}>{LETTERS[i]}. {o}{i === x.correct ? ' ✓' : ''}</li>
                  ))}
                </ol>
                {x.explanation && <p className="soft small" style={{ margin: '8px 0 0' }}>{x.explanation}</p>}
                {x.source && <p className="soft small" style={{ margin: '4px 0 0', wordBreak: 'break-all' }}>Kilde: {x.source}</p>}
                <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button className="btn small" disabled={busy} onClick={() => { setForm(toForm(x)); setFormErr([]); setShowImport(false); window.scrollTo({ top: 0 }) }}>Rediger</button>
                  <button className="btn ghost small" disabled={busy} onClick={() => void toggleHidden(x)}>{x.hidden ? 'Vis' : 'Skjul'}</button>
                  <button className="btn ghost small" disabled={busy} onClick={() => void remove(x)}>Slett</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
