import { describe, expect, it } from 'vitest'
import { formatPercent, formatScore, rankBy, scoreBarWidth } from './format'

describe('format', () => {
  it('score med komma', () => {
    expect(formatScore(7.25)).toBe('7,3')
    expect(formatScore(8)).toBe('8,0')
    expect(formatScore(null)).toBe('–')
  })
  it('prosent', () => {
    expect(formatPercent(0.5)).toBe('50 %')
    expect(formatPercent(1)).toBe('100 %')
    expect(formatPercent(62.4)).toBe('62 %')
    expect(formatPercent(null)).toBe('–')
  })
  it('stolpebredde', () => {
    expect(scoreBarWidth(5)).toBe(50)
    expect(scoreBarWidth(null)).toBe(0)
    expect(scoreBarWidth(12)).toBe(100)
  })
  it('rangering med delt plass og null sist', () => {
    const r = rankBy([{ a: 5 }, { a: 8 }, { a: 8 }, { a: null }], (x) => x.a)
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3, 4])
    expect(r[3].row.a).toBeNull()
  })
})

import { toppTittel } from './format'
describe('toppTittel', () => {
  it('sier «Topp 10» bare når det er mer enn ti', () => {
    expect(toppTittel(11)).toBe('Topp 10')
    expect(toppTittel(100)).toBe('Topp 10')
    expect(toppTittel(10)).toBe('Rangering')
    expect(toppTittel(6)).toBe('Rangering')
    expect(toppTittel(2, 10, 'Sluttresultat')).toBe('Sluttresultat')
  })
})
