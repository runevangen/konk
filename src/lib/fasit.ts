/** Lese inn «én brus per linje» som fasit for glassene, i rekkefølge. Rene funksjoner uten DOM. */

export interface FasitRow {
  pos: number            // glassnummer (1, 2, 3 …)
  raw: string            // linjen slik den ble limt inn
  name: string           // renset navn
  match: string | null   // eksakt navn i gjettelisten (med riktig skrivemåte), eller null
  isNew: boolean         // ikke funnet: må legges til i gjettelisten
  duplicate: boolean     // samme brus står på flere glass
}

export function normalizeName(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Fjerner nummerering («1.», «Glass 2:», «- ») og alle merknader i parentes, som «(N)» og «(Oslo?)». */
export function cleanLine(line: string): string {
  return line
    .replace(/^\s*(?:[-*•]\s+)/, '')
    .replace(/^\s*(?:glass\s*)?\d+\s*[.):\-–—]\s*/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseFasitList(text: string, optionLabels: string[]): FasitRow[] {
  const byNorm = new Map(optionLabels.map((l) => [normalizeName(l), l]))
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
  const rows: FasitRow[] = lines.map((raw, i) => {
    const name = cleanLine(raw)
    const n = normalizeName(name)
    let match = byNorm.get(n) ?? null
    if (!match && n) {
      // entydig prefiks («ring» → «Ringnes»), bare når det finnes nøyaktig ett treff
      const hits = optionLabels.filter((l) => normalizeName(l).startsWith(n))
      if (hits.length === 1) match = hits[0]
    }
    return { pos: i + 1, raw, name, match, isNew: !match && name.length > 0, duplicate: false }
  })
  const seen = new Map<string, number>()
  for (const r of rows) {
    const key = normalizeName(r.match ?? r.name)
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  return rows.map((r) => ({ ...r, duplicate: (seen.get(normalizeName(r.match ?? r.name)) ?? 0) > 1 }))
}

/** Unike nye navn som må legges til i gjettelisten (første skrivemåte beholdes). */
export function newOptionNames(rows: FasitRow[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!r.isNew || !r.name) continue
    const k = normalizeName(r.name)
    if (seen.has(k)) continue
    seen.add(k); out.push(r.name)
  }
  return out
}

/** «Glass 1: Hamar» per linje, til å kopiere og til den som heller opp. */
export function fasitText(rows: { pos: number; brus: string | null }[]): string {
  return rows.map((r) => `Glass ${r.pos}: ${r.brus ?? '–'}`).join('\n')
}
