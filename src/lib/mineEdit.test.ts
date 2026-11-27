import { describe, expect, it } from 'vitest'
import { diffDrafts, type Draft } from './mineEdit'

const d = (score: number | null, guess: string | null = null, comment = ''): Draft => ({ score, guess, comment })

describe('diffDrafts', () => {
  const ids = ['a', 'b', 'c']
  it('sender ingenting når ingenting er endret', () => {
    const o = { a: d(5, 'x', 'ok'), b: d(7), c: null }
    const r = diffDrafts(ids, o, { a: d(5, 'x', 'ok'), b: d(7), c: d(null) })
    expect(r).toEqual({ toSave: [], missingScore: [], changed: 0 })
  })
  it('sender bare glass som er endret', () => {
    const o = { a: d(5), b: d(7), c: null }
    const r = diffDrafts(ids, o, { a: d(6), b: d(7), c: d(null) })
    expect(r.toSave.map((s) => s.itemId)).toEqual(['a'])
    expect(r.toSave[0].score).toBe(6)
  })
  it('endret gjetning eller kommentar teller også', () => {
    const o = { a: d(5, null, ''), b: d(7, 'x', 'hei'), c: null }
    const r = diffDrafts(ids, o, { a: d(5, 'x', ''), b: d(7, 'x', 'hei du'), c: d(null) })
    expect(r.toSave.map((s) => s.itemId)).toEqual(['a', 'b'])
  })
  it('mellomrom i kommentaren alene er ingen endring, og tom kommentar blir null', () => {
    const o = { a: d(5, null, 'hei'), b: null, c: null }
    expect(diffDrafts(['a'], o, { a: d(5, null, 'hei  ') }).changed).toBe(0)
    expect(diffDrafts(['a'], o, { a: d(5, null, '') }).toSave[0].comment).toBeNull()
  })
  it('nytt glass uten score gis i missingScore og lagres ikke', () => {
    const o = { a: null, b: null, c: null }
    const r = diffDrafts(ids, o, { a: d(null, 'x'), b: d(8), c: d(null, null, '  ') })
    expect(r.missingScore).toEqual(['a'])
    expect(r.toSave.map((s) => s.itemId)).toEqual(['b'])
    expect(r.changed).toBe(2)
  })
  it('ugyldig score avvises', () => {
    const r = diffDrafts(['a'], { a: d(5) }, { a: d(11 as number) })
    expect(r.toSave).toEqual([])
    expect(r.missingScore).toEqual(['a'])
  })
})
