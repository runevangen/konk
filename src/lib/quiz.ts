import type { OfficeRow, RankRow } from '../api/quiz'

/** Romkoden: store bokstaver A–Z, maks fire tegn. Alt annet (mellomrom, tall, tegnsetting) fjernes. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}
export const isCode = (c: string) => /^[A-Z]{4}$/.test(c)

/** Gjenstående tid ut fra det serveren sa ved mottak, minus tiden som har gått siden. Aldri negativ. */
export function remainingMs(leftMs: number | undefined, elapsedMs: number): number {
  return Math.max(0, (leftMs ?? 0) - Math.max(0, elapsedMs))
}
export const secondsLeft = (ms: number) => Math.ceil(ms / 1000)

/** Andel av tiden som er igjen (0–1), til nedtellingsstolpen. */
export function fractionLeft(ms: number, totalSeconds: number): number {
  return totalSeconds > 0 ? Math.min(1, Math.max(0, ms / (totalSeconds * 1000))) : 0
}

/** Egen plassering. Likt antall poeng og riktige gir delt plass. */
export function placeOf(ranking: RankRow[]): { rank: number; of: number; row: RankRow } | null {
  const me = ranking.find((r) => r.me)
  if (!me) return null
  const rank = 1 + ranking.filter((r) => r.points > me.points || (r.points === me.points && r.correct > me.correct)).length
  return { rank, of: ranking.length, row: me }
}

export const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : String(rank))

/** Delte plasser: rad i rangeringen får samme nummer når poeng og riktige er like. */
export function ranked(ranking: RankRow[]): { rank: number; row: RankRow }[] {
  return ranking.map((row) => ({
    row,
    rank: 1 + ranking.filter((r) => r.points > row.points || (r.points === row.points && r.correct > row.correct)).length,
  }))
}

/** Kontoret som vinner: høyest snitt per spiller (rettferdig når kontorene er ulikt store), deretter sum. */
export function officeWinner(offices: OfficeRow[]): OfficeRow | null {
  const withPlayers = offices.filter((o) => o.players > 0)
  if (!withPlayers.length) return null
  return [...withPlayers].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0) || b.points - a.points || a.office.localeCompare(b.office, 'nb'))[0]
}
export function isOfficeTie(offices: OfficeRow[]): boolean {
  const w = officeWinner(offices)
  if (!w) return false
  return offices.filter((o) => o.players > 0 && (o.avg ?? 0) === (w.avg ?? 0) && o.points === w.points).length > 1
}

const JOIN_ERRORS: Record<string, string> = {
  not_found: 'Fant ikke noe rom med den koden.',
  started: 'Runden har allerede startet. Vent til neste.',
  full: 'Rommet er fullt.',
  too_many: 'For mange forsøk. Vent ett minutt og prøv igjen.',
  not_member: 'Du er ikke med i dette rommet.',
}
export const joinErrorText = (code: string) => JOIN_ERRORS[code] ?? 'Kunne ikke bli med i rommet.'
