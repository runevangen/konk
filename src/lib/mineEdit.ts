import { cleanComment, isValidScore } from './validation'

/** Utkastet for ett glass i rediger-modus. `score` er null til noen har valgt. */
export interface Draft { score: number | null; guess: string | null; comment: string }

export interface ToSave { itemId: string; score: number; guess: string | null; comment: string | null }

/**
 * Hva «Lagre alle» skal gjøre: bare glass som er endret sendes, og glass uten gyldig score
 * sendes ikke (de gis i `missingScore`, så skjermen kan si hvilke det gjelder).
 * `original` er null for et glass som ikke er besvart ennå.
 */
export function diffDrafts(
  itemIds: string[],
  original: Record<string, Draft | null>,
  drafts: Record<string, Draft>,
): { toSave: ToSave[]; missingScore: string[]; changed: number } {
  const toSave: ToSave[] = []
  const missingScore: string[] = []
  let changed = 0
  for (const id of itemIds) {
    const d = drafts[id]
    if (!d) continue
    const o = original[id] ?? null
    const touched = o
      ? d.score !== o.score || d.guess !== o.guess || d.comment.trim() !== o.comment.trim()
      : d.score !== null || d.guess !== null || d.comment.trim() !== ''
    if (!touched) continue
    changed++
    if (!isValidScore(d.score)) { missingScore.push(id); continue }
    toSave.push({ itemId: id, score: d.score, guess: d.guess, comment: cleanComment(d.comment) })
  }
  return { toSave, missingScore, changed }
}
