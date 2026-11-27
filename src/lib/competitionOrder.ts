/** Flytter ett element ett hakk opp eller ned og gir de nye sort_order-verdiene (10, 20, 30 …) for de som har endret plass. */
export function moveInOrder<T extends { id: string; sort_order: number }>(list: T[], id: string, dir: -1 | 1): { list: T[]; changes: { id: string; sort_order: number }[] } {
  const i = list.findIndex((x) => x.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return { list, changes: [] }
  const next = list.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  const out = next.map((x, k) => ({ ...x, sort_order: (k + 1) * 10 }))
  const changes = out.filter((x, k) => x.sort_order !== list[k].sort_order || x.id !== list[k].id).map((x) => ({ id: x.id, sort_order: x.sort_order }))
  return { list: out, changes }
}
