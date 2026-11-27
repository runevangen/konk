import { TASTE_TAGS } from './validation'

export interface StatEntry { user_id: string; score: number | null; guess_option_id: string | null; comment: string | null; hidden: boolean; tags: string[]; featured: boolean }
export interface StatOption { id: string; label: string }
export interface StatProfile { id: string; display_name: string; anonymous: boolean; office_id: string | number | null }

/** Antall svar per score 1–10 (indeks 0 = score 1). */
export function scoreHistogram(entries: readonly StatEntry[], max = 10): number[] {
  const h = Array<number>(max).fill(0)
  for (const e of entries) if (e.score != null && Number.isInteger(e.score) && e.score >= 1 && e.score <= max) h[e.score - 1]++
  return h
}

/** Hva ble gjettet? Flest først; riktig svar er markert. «Vet ikke» telles for seg, og vises bare når noen har valgt det. */
export function guessDistribution(entries: readonly StatEntry[], options: readonly StatOption[], correctId: string | null | undefined) {
  const counts = new Map<string, number>()
  let none = 0
  for (const e of entries) {
    if (e.score == null) continue
    if (!e.guess_option_id) none++
    else counts.set(e.guess_option_id, (counts.get(e.guess_option_id) ?? 0) + 1)
  }
  const rows = options
    .map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) ?? 0, correct: o.id === correctId }))
    .filter((r) => r.count > 0 || r.correct)
    .sort((a, b) => b.count - a.count || Number(b.correct) - Number(a.correct) || a.label.localeCompare(b.label, 'nb'))
  const total = rows.reduce((s, r) => s + r.count, 0) + none
  return { rows, none, total }
}

/** Smaksmerker telt, flest først (kjente merker i fast rekkefølge ved likt antall). */
export function tagCounts(entries: readonly StatEntry[]) {
  const c = new Map<string, number>()
  for (const e of entries) for (const t of e.tags ?? []) c.set(t, (c.get(t) ?? 0) + 1)
  return [...c.entries()].map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || TASTE_TAGS.indexOf(a.tag as (typeof TASTE_TAGS)[number]) - TASTE_TAGS.indexOf(b.tag as (typeof TASTE_TAGS)[number]))
}

/** Kommentarer som kan vises: ikke skjulte og ikke tomme; dagens sitat først. Anonyme vises som «Anonym». */
export function visibleComments(entries: readonly StatEntry[], profiles: readonly StatProfile[], officeName: (id: string | number | null) => string) {
  const byId = new Map(profiles.map((p) => [p.id, p]))
  return entries
    .filter((e) => !e.hidden && e.comment && e.comment.trim() !== '')
    .map((e) => {
      const p = byId.get(e.user_id)
      return { text: e.comment!.trim(), featured: e.featured, name: !p || p.anonymous ? 'Anonym' : p.display_name, office: officeName(p?.office_id ?? null), score: e.score }
    })
    .sort((a, b) => Number(b.featured) - Number(a.featured))
}
