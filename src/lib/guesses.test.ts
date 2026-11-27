import { describe, expect, it } from 'vitest'
import { glassList, guessResult, usedGuesses } from './guesses'

const g: Record<string, string | null> = { a: 'x', b: 'y', c: 'x', d: null, e: 'x' }

describe('usedGuesses', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  it('samler glassnumre per valg, uten glasset du står på', () => {
    const m = usedGuesses(ids, (id) => g[id], 'c')
    expect(m.get('x')).toEqual([1, 5])
    expect(m.get('y')).toEqual([2])
  })
  it('ubesvarte og «vet ikke» teller ikke', () => {
    const m = usedGuesses(ids, (id) => g[id], 'a')
    expect([...m.keys()].sort()).toEqual(['x', 'y'])
    expect(m.get('x')).toEqual([3, 5])
  })
  it('ingenting brukt gir tomt', () => {
    expect(usedGuesses(['a'], () => null, 'a').size).toBe(0)
  })
  it('formaterer listen', () => { expect(glassList([2, 5])).toBe('glass 2, 5') })
})

describe('guessResult', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  const mine: Record<string, string | null> = { a: 'x', b: 'y', c: null, d: 'z', e: 'x' }
  const fasit: Record<string, string | null> = { a: 'x', b: 'x', c: 'x', d: null, e: 'x' }
  it('teller riktige, gjettede og glass med fasit', () => {
    const r = guessResult(ids, (id) => mine[id], fasit)
    expect(r.rows.map((x) => x.status)).toEqual(['riktig', 'feil', 'ingen', 'ukjent', 'riktig'])
    expect(r.hits).toBe(2); expect(r.guessed).toBe(3); expect(r.withFasit).toBe(4)
  })
  it('uten noen svar er alt «ingen», og uten fasit er alt «ukjent»', () => {
    expect(guessResult(['a'], () => null, { a: 'x' }).rows[0].status).toBe('ingen')
    expect(guessResult(['a'], () => 'x', {}).rows[0].status).toBe('ukjent')
  })
})
