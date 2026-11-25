/** 7.25 -> "7,3"; null/NaN -> "–" */
export function formatScore(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(Number(n))) return '–'
  return Number(n).toFixed(digits).replace('.', ',')
}
/** Treffprosent: 0..1 tolkes som andel, verdier over 1 som prosent. 0.5 -> "50 %" */
export function formatPercent(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '–'
  const v = Number(n) <= 1 ? Number(n) * 100 : Number(n)
  return `${Math.round(v)} %`
}
/** Bredde 0..100 for stolper (skala 1-10). */
export function scoreBarWidth(n: number | null | undefined): number {
  if (n == null) return 0
  return Math.max(0, Math.min(100, (Number(n) / 10) * 100))
}
export interface Ranked<T> { rank: number; row: T }
/** Rangering høyest snitt først; like snitt deler plass; null sist. */
export function rankBy<T>(rows: T[], get: (r: T) => number | null): Ranked<T>[] {
  const sorted = [...rows].sort((a, b) => (get(b) ?? -Infinity) - (get(a) ?? -Infinity))
  let rank = 0
  let prev: number | null | undefined = undefined
  return sorted.map((row, i) => {
    const v = get(row)
    if (v !== prev) { rank = i + 1; prev = v }
    return { rank, row }
  })
}
export function pluralize(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}
