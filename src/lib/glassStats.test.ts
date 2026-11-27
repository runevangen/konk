import { describe, expect, it } from 'vitest'
import { guessDistribution, scoreHistogram, tagCounts, visibleComments, type StatEntry } from './glassStats'

const e = (o: Partial<StatEntry>): StatEntry => ({ user_id: 'u', score: 5, guess_option_id: null, comment: null, hidden: false, tags: [], featured: false, ...o })

describe('glassStats', () => {
  it('scoreHistogram teller per score og ignorerer ugyldige', () => {
    const h = scoreHistogram([e({ score: 1 }), e({ score: 10 }), e({ score: 10 }), e({ score: null }), e({ score: 11 }), e({ score: 0 })])
    expect(h).toHaveLength(10); expect(h[0]).toBe(1); expect(h[9]).toBe(2); expect(h.reduce((a, b) => a + b, 0)).toBe(3)
  })
  it('guessDistribution: flest først, riktig markert og med selv om ingen valgte den', () => {
    const opts = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
    const d = guessDistribution([e({ guess_option_id: 'b' }), e({ guess_option_id: 'b' }), e({ guess_option_id: 'a' }), e({ guess_option_id: null })], opts, 'c')
    expect(d.rows.map((r) => [r.label, r.count, r.correct])).toEqual([['B', 2, false], ['A', 1, false], ['C', 0, true]])
    expect(d.none).toBe(1); expect(d.total).toBe(4)
  })
  it('guessDistribution uten fasit og uten svar gir tomt', () => {
    expect(guessDistribution([], [{ id: 'a', label: 'A' }], null)).toEqual({ rows: [], none: 0, total: 0 })
  })
  it('tagCounts: flest først, ellers fast rekkefølge', () => {
    const t = tagCounts([e({ tags: ['Sur', 'Søt'] }), e({ tags: ['Søt'] }), e({ tags: ['Krydret'] })])
    expect(t.map((x) => x.tag)).toEqual(['Søt', 'Krydret', 'Sur'])
  })
  it('visibleComments: skjuler skjulte/tomme, anonyme blir Anonym, sitat først', () => {
    const profiles = [{ id: 'u1', display_name: 'Kari', anonymous: false, office_id: 1 }, { id: 'u2', display_name: 'Ola', anonymous: true, office_id: 2 }]
    const c = visibleComments([
      e({ user_id: 'u1', comment: ' Fin ' }), e({ user_id: 'u2', comment: 'Søt', featured: true }),
      e({ user_id: 'u1', comment: 'Skjult', hidden: true }), e({ user_id: 'u1', comment: '  ' }),
    ], profiles, (id) => (id === 1 ? 'Oslo' : 'Stavanger'))
    expect(c.map((x) => [x.text, x.name, x.office, x.featured])).toEqual([['Søt', 'Anonym', 'Stavanger', true], ['Fin', 'Kari', 'Oslo', false]])
  })
})
