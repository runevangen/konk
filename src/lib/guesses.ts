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
