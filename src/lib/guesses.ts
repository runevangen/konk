/**
 * Hvilke gjetninger har du alt brukt på andre glass? Gir for hvert valg en liste med glassnumre (1-basert),
 * uten det glasset du står på. Du kan fortsatt gjette det samme flere ganger; dette er bare en påminnelse.
 */
export function usedGuesses(
  itemIds: readonly string[],
  guessOf: (itemId: string) => string | null | undefined,
  currentItemId: string,
): Map<string, number[]> {
  const used = new Map<string, number[]>()
  itemIds.forEach((id, i) => {
    if (id === currentItemId) return
    const g = guessOf(id)
    if (!g) return
    const list = used.get(g) ?? []
    list.push(i + 1)
    used.set(g, list)
  })
  return used
}

/** «glass 2, 5» */
export const glassList = (nums: readonly number[]) => `glass ${nums.join(', ')}`

export type GuessStatus = 'riktig' | 'feil' | 'ingen' | 'ukjent'
/**
 * Hva ble resultatet av gjetningene dine? `correct` er fasit per glass (null/mangler hvis den ikke er satt).
 * riktig = gjettet riktig, feil = gjettet noe annet, ingen = svarte «vet ikke» eller ikke i det hele tatt, ukjent = fasit mangler.
 */
export function guessResult(itemIds: readonly string[], guessOf: (itemId: string) => string | null | undefined, correct: Record<string, string | null | undefined>) {
  const rows = itemIds.map((id) => {
    const c = correct[id] ?? null
    const g = guessOf(id) ?? null
    const status: GuessStatus = !c ? 'ukjent' : !g ? 'ingen' : g === c ? 'riktig' : 'feil'
    return { itemId: id, status }
  })
  const hits = rows.filter((r) => r.status === 'riktig').length
  const guessed = rows.filter((r) => r.status === 'riktig' || r.status === 'feil').length
  const withFasit = rows.filter((r) => r.status !== 'ukjent').length
  return { rows, hits, guessed, withFasit }
}
