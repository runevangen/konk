import { describe, expect, it } from 'vitest'
import { glassList, usedGuesses } from './guesses'

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
