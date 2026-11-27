/** Innlesing, validering og eksport av quizspørsmål (JSON og CSV/TSV). Rene funksjoner uten DOM og nettverk. */

export interface QuizQuestionInput {
  theme: string
  category: string | null
  difficulty: string | null
  question: string
  options: [string, string, string, string]
  correct: 0 | 1 | 2 | 3
  explanation: string
  source: string | null
  sourceLevel: number | null          // 1 = beste kilde … 5 = svakeste
  reviewStatus: 'ok' | 'usikker' | null
  reviewNote: string | null
}

export interface ParsedRow {
  line: number                  // 1-basert nummer i filen (rad eller element)
  label: string                 // kort tekst til visning
  question: QuizQuestionInput | null
  errors: string[]
  duplicate: 'file' | 'bank' | null
}

export interface ParseResult {
  format: 'json' | 'csv' | 'tom' | 'ukjent'
  rows: ParsedRow[]
  fatal: string | null
}

export const LIMITS = { question: [3, 300], option: 120, explanation: 500, source: 300, category: 40, difficulty: 20, theme: 40, note: 600 } as const
export const LETTERS = ['A', 'B', 'C', 'D'] as const

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').normalize('NFC').trim()
const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const hit = Object.keys(o).find((x) => x.toLowerCase().normalize('NFC') === k)
    if (hit !== undefined) return o[hit]
  }
  return undefined
}

export function questionKey(theme: string, question: string): string {
  return `${theme.trim().toLowerCase()}|${question.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()}`
}

/** Tolker «riktig»: bokstav A–D, tall 1–4, eller selve alternativteksten. */
export function parseCorrect(raw: unknown, options: string[]): 0 | 1 | 2 | 3 | null {
  const v = str(raw)
  if (!v) return null
  const up = v.toUpperCase()
  const li = LETTERS.indexOf(up as (typeof LETTERS)[number])
  if (li >= 0) return li as 0 | 1 | 2 | 3
  if (/^[1-4]$/.test(v)) return (Number(v) - 1) as 0 | 1 | 2 | 3
  const byText = options.findIndex((o) => o.toLowerCase() === v.toLowerCase())
  return byText >= 0 ? (byText as 0 | 1 | 2 | 3) : null
}

export function validateQuestion(q: Partial<QuizQuestionInput> & { options?: string[] }): string[] {
  const e: string[] = []
  const question = (q.question ?? '').trim()
  if (question.length < LIMITS.question[0] || question.length > LIMITS.question[1]) e.push(`Spørsmålet må være ${LIMITS.question[0]}–${LIMITS.question[1]} tegn (er ${question.length}).`)
  const opts = q.options ?? []
  if (opts.length !== 4) e.push('Det må være nøyaktig fire alternativer.')
  else {
    opts.forEach((o, i) => {
      const t = o.trim()
      if (!t) e.push(`Alternativ ${LETTERS[i]} er tomt.`)
      else if (t.length > LIMITS.option) e.push(`Alternativ ${LETTERS[i]} er for langt (maks ${LIMITS.option} tegn).`)
    })
    const norm = opts.map((o) => o.trim().toLowerCase()).filter(Boolean)
    if (new Set(norm).size !== norm.length) e.push('Alternativene må være ulike.')
  }
  if (q.correct === undefined || q.correct === null) e.push('Riktig svar mangler eller passer ikke til et alternativ (bruk A–D).')
  if ((q.explanation ?? '').length > LIMITS.explanation) e.push(`Forklaringen er for lang (maks ${LIMITS.explanation} tegn).`)
  if ((q.source ?? '').length > LIMITS.source) e.push(`Kilden er for lang (maks ${LIMITS.source} tegn).`)
  if ((q.category ?? '').length > LIMITS.category) e.push(`Kategorien er for lang (maks ${LIMITS.category} tegn).`)
  if ((q.difficulty ?? '').length > LIMITS.difficulty) e.push(`Vanskeligheten er for lang (maks ${LIMITS.difficulty} tegn).`)
  if (q.sourceLevel !== undefined && q.sourceLevel !== null && !(Number.isInteger(q.sourceLevel) && q.sourceLevel >= 1 && q.sourceLevel <= 5)) e.push('Kildenivå må være et tall fra 1 til 5.')
  if ((q.reviewNote ?? '').length > LIMITS.note) e.push(`Merknaden er for lang (maks ${LIMITS.note} tegn).`)
  const theme = (q.theme ?? '').trim()
  if (!theme || theme.length > LIMITS.theme) e.push(`Temaet må være 1–${LIMITS.theme} tegn.`)
  return e
}

function build(raw: { theme?: unknown; category?: unknown; difficulty?: unknown; question?: unknown; options: unknown[]; correct?: unknown; explanation?: unknown; source?: unknown; sourceLevel?: unknown; status?: unknown; note?: unknown }, defaultTheme: string, line: number): ParsedRow {
  const options = raw.options.map(str)
  const correct = options.length === 4 ? parseCorrect(raw.correct, options) : null
  const q = {
    theme: str(raw.theme) || defaultTheme.trim(),
    category: str(raw.category) || null,
    difficulty: str(raw.difficulty) || null,
    question: str(raw.question),
    options: options as [string, string, string, string],
    correct: (correct ?? undefined) as 0 | 1 | 2 | 3 | undefined,
    explanation: str(raw.explanation),
    source: str(raw.source) || null,
    sourceLevel: null as number | null,
    reviewStatus: null as 'ok' | 'usikker' | null,
    reviewNote: str(raw.note) || null,
  }
  const errors: string[] = []
  const lvl = str(raw.sourceLevel)
  if (lvl) { const n = Number(lvl); if (Number.isInteger(n)) q.sourceLevel = n; else errors.push('Kildenivå må være et tall fra 1 til 5.') }
  const st = str(raw.status).toLowerCase()
  if (st === 'ok' || st === 'usikker') q.reviewStatus = st
  else if (st) errors.push(`Ukjent status «${str(raw.status)}». Bruk OK eller Usikker.`)
  errors.push(...validateQuestion(q))
  const label = q.question ? (q.question.length > 70 ? q.question.slice(0, 67) + '…' : q.question) : '(uten spørsmål)'
  return { line, label, errors, duplicate: null, question: errors.length ? null : (q as QuizQuestionInput) }
}

function optionsFromJson(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const keys = ['a', 'b', 'c', 'd']
    const byLetter = keys.map((k) => { const hit = Object.keys(o).find((x) => x.toLowerCase() === k); return hit === undefined ? undefined : o[hit] })
    if (byLetter.every((x) => x !== undefined)) return byLetter
    const byNum = ['1', '2', '3', '4'].map((k) => o[k])
    if (byNum.every((x) => x !== undefined)) return byNum
    return Object.values(o)
  }
  return []
}

function parseJson(text: string, defaultTheme: string): ParseResult {
  let data: unknown
  try { data = JSON.parse(text) } catch (e) { return { format: 'json', rows: [], fatal: `Ugyldig JSON: ${(e as Error).message}` } }
  const list = Array.isArray(data) ? data : data && typeof data === 'object' ? ((data as Record<string, unknown>).questions ?? (data as Record<string, unknown>).spoersmaal ?? (data as Record<string, unknown>).sporsmal) : null
  if (!Array.isArray(list)) return { format: 'json', rows: [], fatal: 'JSON må være en liste med spørsmål (eller et objekt med «questions»).' }
  const rows = list.map((item, i) => {
    if (!item || typeof item !== 'object') return { line: i + 1, label: '(ikke et objekt)', question: null, errors: ['Elementet er ikke et spørsmål.'], duplicate: null } as ParsedRow
    const o = item as Record<string, unknown>
    return build({
      theme: pick(o, ['tema', 'theme']),
      category: pick(o, ['kategori', 'category']),
      difficulty: pick(o, ['vanskelighet', 'difficulty']),
      question: pick(o, ['spoersmaal', 'spørsmål', 'sporsmal', 'question']),
      options: optionsFromJson(pick(o, ['alternativer', 'options', 'svar'])),
      correct: pick(o, ['riktig', 'correct', 'fasit']),
      explanation: pick(o, ['forklaring', 'explanation']),
      source: pick(o, ['kilde', 'source']),
      sourceLevel: pick(o, ['kilde_nivaa', 'kilde_nivå', 'kildenivaa', 'kildenivå', 'source_level']),
      status: pick(o, ['status', 'review_status']),
      note: pick(o, ['merknad', 'review_note', 'note']),
    }, defaultTheme, Number(o.nr) || i + 1)
  })
  return { format: 'json', rows, fatal: null }
}

/** Enkel CSV-leser med anførselstegn og ulike skilletegn. */
export function parseCsvTable(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []; let cell = ''; let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else inQ = false } else cell += c
    } else if (c === '"') inQ = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

function parseCsv(text: string, defaultTheme: string): ParseResult {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = ['\t', ';', ','].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const table = parseCsvTable(text, delim)
  if (table.length < 2) return { format: 'csv', rows: [], fatal: 'Fant ingen rader under overskriften.' }
  const head = table[0].map((h) => h.trim().toLowerCase().normalize('NFC'))
  const col = (names: string[]) => head.findIndex((h) => names.includes(h))
  const idx = {
    theme: col(['tema', 'theme']), category: col(['kategori', 'category']), difficulty: col(['vanskelighet', 'difficulty']),
    question: col(['spørsmål', 'spoersmaal', 'sporsmal', 'question']),
    a: col(['a', 'alternativ a', 'alternativ 1', '1']), b: col(['b', 'alternativ b', 'alternativ 2', '2']),
    c: col(['c', 'alternativ c', 'alternativ 3', '3']), d: col(['d', 'alternativ d', 'alternativ 4', '4']),
    correct: col(['riktig', 'correct', 'fasit']), explanation: col(['forklaring', 'explanation']), source: col(['kilde', 'source']),
    sourceLevel: col(['kildenivå', 'kildenivaa', 'kilde_nivaa', 'source_level']), status: col(['status']), note: col(['merknad', 'note']),
  }
  const missing = (['question', 'a', 'b', 'c', 'd', 'correct'] as const).filter((k) => idx[k] < 0)
  if (missing.length) return { format: 'csv', rows: [], fatal: `Overskriften mangler kolonner: ${missing.map((m) => ({ question: 'spørsmål', a: 'A', b: 'B', c: 'C', d: 'D', correct: 'riktig' })[m]).join(', ')}.` }
  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? '' : '')
  const rows = table.slice(1).map((r, i) => build({
    theme: get(r, idx.theme), category: get(r, idx.category), difficulty: get(r, idx.difficulty), question: get(r, idx.question),
    options: [get(r, idx.a), get(r, idx.b), get(r, idx.c), get(r, idx.d)], correct: get(r, idx.correct),
    explanation: get(r, idx.explanation), source: get(r, idx.source),
    sourceLevel: get(r, idx.sourceLevel), status: get(r, idx.status), note: get(r, idx.note),
  }, defaultTheme, i + 2))
  return { format: 'csv', rows, fatal: null }
}

export function parseQuizText(raw: string, defaultTheme: string): ParseResult {
  const text = raw.replace(/^﻿/, '').trim()
  if (!text) return { format: 'tom', rows: [], fatal: null }
  if (text.startsWith('[') || text.startsWith('{')) return parseJson(text, defaultTheme)
  if (/[\t;,]/.test(text.split(/\r?\n/, 1)[0] ?? '')) return parseCsv(text, defaultTheme)
  return { format: 'ukjent', rows: [], fatal: 'Kjente ikke igjen formatet. Bruk JSON eller CSV med overskrift.' }
}

/** Markerer dubletter innad i lista og mot spørsmål som allerede finnes i banken. */
export function markDuplicates(rows: ParsedRow[], existingKeys: Set<string>): ParsedRow[] {
  const seen = new Set<string>()
  return rows.map((r) => {
    if (!r.question) return r
    const k = questionKey(r.question.theme, r.question.question)
    if (existingKeys.has(k)) return { ...r, duplicate: 'bank' as const }
    if (seen.has(k)) return { ...r, duplicate: 'file' as const }
    seen.add(k)
    return r
  })
}

export const importable = (rows: ParsedRow[]) => rows.filter((r) => r.question && !r.duplicate)

/** Samme format som innlesingen forstår (norske nøkler, alternativer A–D, riktig som bokstav). */
export function toExportJson(rows: (QuizQuestionInput & { hidden?: boolean })[]): string {
  return JSON.stringify(rows.map((q, i) => ({
    nr: i + 1, tema: q.theme, kategori: q.category ?? '', vanskelighet: q.difficulty ?? '', spoersmaal: q.question,
    alternativer: { A: q.options[0], B: q.options[1], C: q.options[2], D: q.options[3] },
    riktig: LETTERS[q.correct], forklaring: q.explanation, kilde: q.source ?? '',
    kilde_nivaa: q.sourceLevel, status: q.reviewStatus === 'ok' ? 'OK' : q.reviewStatus === 'usikker' ? 'Usikker' : '', merknad: q.reviewNote ?? '',
  })), null, 2)
}

/** Navn på nytt tema: 1–40 tegn, og ikke et som finnes (store/små bokstaver og ekstra mellomrom teller ikke). */
export function validateThemeName(name: string, existing: readonly string[]): string | null {
  const t = name.replace(/\s+/g, ' ').trim()
  if (!t) return 'Skriv et navn på temaet.'
  if (t.length > LIMITS.theme) return `Navnet kan ha maks ${LIMITS.theme} tegn.`
  const key = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase()
  if (existing.some((e) => key(e) === key(t))) return 'Det finnes allerede et tema med det navnet.'
  return null
}
export const cleanThemeName = (name: string) => name.replace(/\s+/g, ' ').trim()
