export const PIN_LENGTH = 6
export const COMMENT_MAX = 500
export const SCORE_MIN = 1
export const SCORE_MAX = 10

/** Fjerner alt som ikke er siffer og kapper til 6 tegn (lim inn "123 456" fungerer). */
export function normalizePin(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, PIN_LENGTH)
}
export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}
/** Samme regel som backend: samme siffer (111111) og rene rekker (123456, 654321) er for lette å gjette. */
export function isWeakPin(pin: string): boolean {
  if (!/^\d{6}$/.test(pin)) return false
  if (/^(\d)\1{5}$/.test(pin)) return true
  const d = [...pin].map(Number)
  return d.every((v, i) => i === 0 || v === d[i - 1] + 1) || d.every((v, i) => i === 0 || v === d[i - 1] - 1)
}
export function validateDisplayName(name: string): string | null {
  const t = name.trim()
  if (t.length < 2) return 'Navnet må ha minst 2 tegn.'
  if (t.length > 40) return 'Navnet kan ha maks 40 tegn.'
  return null
}
export function isValidScore(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= SCORE_MIN && n <= SCORE_MAX
}
export function validateComment(c: string): string | null {
  return c.length > COMMENT_MAX ? `Kommentaren kan ha maks ${COMMENT_MAX} tegn.` : null
}
/** Tom/blank kommentar lagres som null. */
export function cleanComment(c: string): string | null {
  const t = c.trim()
  return t ? t : null
}
export function validateSlug(s: string): string | null {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) ? null : 'Slug kan bare ha små bokstaver, tall og bindestrek.'
}

/** Hurtigvalg for smak. Samme liste som sjekk-regelen i databasen (konk_entries_tags_ok). */
export const TASTE_TAGS = ['Søt', 'Krydret', 'Bitter', 'Fruktig', 'Maltig', 'Sur', 'Lett', 'Kraftig'] as const
export type TasteTag = (typeof TASTE_TAGS)[number]
/** Bare kjente merker, uten dubletter, i fast rekkefølge. */
export function cleanTags(tags: readonly string[] | null | undefined): TasteTag[] {
  const set = new Set(tags ?? [])
  return TASTE_TAGS.filter((t) => set.has(t))
}
/** Slår et merke av/på i en liste. */
export function toggleTag(tags: readonly string[], tag: string): TasteTag[] {
  return cleanTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag])
}
/** Smaksprofil for ett glass: de vanligste merkene først. Vises bare når minst to har satt merker, så ingen enkeltperson kan kjennes igjen. */
export function tasteProfile(counts: Record<string, number> | null | undefined, n: number, minVoters = 2): { tag: string; count: number; share: number }[] {
  const entries = Object.entries(counts ?? {}).filter(([t]) => (TASTE_TAGS as readonly string[]).includes(t))
  if (!entries.length || n < minVoters) return []
  return entries.map(([tag, count]) => ({ tag, count, share: n ? count / n : 0 }))
    .sort((a, b) => b.count - a.count || TASTE_TAGS.indexOf(a.tag as TasteTag) - TASTE_TAGS.indexOf(b.tag as TasteTag))
}
