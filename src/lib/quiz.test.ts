import { describe, expect, it } from 'vitest'
import type { OfficeRow, RankRow } from '../api/quiz'
import { fractionLeft, isCode, isOfficeTie, joinErrorText, medal, normalizeCode, officeWinner, placeOf, ranked, remainingMs, secondsLeft } from './quiz'

const R = (name: string, points: number, correct: number, me = false): RankRow => ({ name, office: 'Oslo', points, correct, me })
const O = (office: string, players: number, points: number): OfficeRow => ({ office, players, points, avg: players ? Math.round((points / players) * 10) / 10 : null, correct: 0 })

describe('normalizeCode', () => {
  it('gir store bokstaver, uten mellomrom og tegn, maks fire', () => {
    expect(normalizeCode(' ab cd ')).toBe('ABCD')
    expect(normalizeCode('a1b-2c')).toBe('ABC')
    expect(normalizeCode('abcdef')).toBe('ABCD')
    expect(normalizeCode('')).toBe('')
  })
  it('isCode krever nøyaktig fire bokstaver', () => {
    expect(isCode('ABCD')).toBe(true)
    expect(isCode('ABC')).toBe(false)
    expect(isCode('abcd')).toBe(false)
  })
})

describe('nedtelling', () => {
  it('trekker fra tiden som har gått, og blir aldri negativ', () => {
    expect(remainingMs(30000, 2500)).toBe(27500)
    expect(remainingMs(1000, 5000)).toBe(0)
    expect(remainingMs(undefined, 100)).toBe(0)
    expect(remainingMs(1000, -50)).toBe(1000)
  })
  it('runder sekunder opp og regner andel', () => {
    expect(secondsLeft(27500)).toBe(28)
    expect(secondsLeft(0)).toBe(0)
    expect(fractionLeft(15000, 30)).toBe(0.5)
    expect(fractionLeft(99999, 30)).toBe(1)
    expect(fractionLeft(-5, 30)).toBe(0)
    expect(fractionLeft(1000, 0)).toBe(0)
  })
})

describe('rangering', () => {
  it('finner egen plass og deler plass ved likt resultat', () => {
    const rows = [R('A', 300, 3), R('B', 200, 2, true), R('C', 200, 2), R('D', 100, 1)]
    expect(placeOf(rows)).toMatchObject({ rank: 2, of: 4 })
    expect(ranked(rows).map((r) => r.rank)).toEqual([1, 2, 2, 4])
  })
  it('likt antall poeng, men flere riktige gir bedre plass', () => {
    const rows = [R('A', 200, 3), R('B', 200, 2, true)]
    expect(placeOf(rows)?.rank).toBe(2)
  })
  it('ingen plass for den som ikke spiller', () => {
    expect(placeOf([R('A', 1, 1)])).toBeNull()
  })
  it('medaljer for topp tre', () => {
    expect([1, 2, 3, 4].map(medal)).toEqual(['🥇', '🥈', '🥉', '4'])
  })
})

describe('kontorrangering', () => {
  it('vinneren er høyest snitt per spiller, ikke høyest sum', () => {
    const w = officeWinner([O('Oslo', 10, 3000), O('Stavanger', 2, 800)])
    expect(w?.office).toBe('Stavanger')
  })
  it('ved lik snitt avgjør summen, og kontor uten spillere teller ikke', () => {
    expect(officeWinner([O('Oslo', 2, 600), O('Stavanger', 1, 300), O('Bergen', 0, 0)])?.office).toBe('Oslo')
    expect(officeWinner([O('Oslo', 0, 0)])).toBeNull()
  })
  it('oppdager uavgjort', () => {
    expect(isOfficeTie([O('Oslo', 2, 600), O('Stavanger', 2, 600)])).toBe(true)
    expect(isOfficeTie([O('Oslo', 2, 600), O('Stavanger', 2, 500)])).toBe(false)
  })
})

describe('feilmeldinger', () => {
  it('har norsk tekst for alle kjente feil', () => {
    for (const c of ['not_found', 'started', 'full', 'too_many', 'not_member']) expect(joinErrorText(c).length).toBeGreaterThan(10)
    expect(joinErrorText('noe-annet')).toContain('Kunne ikke')
  })
})

import { placeLabel } from './quiz'
describe('placeLabel', () => {
  it('tall på alle plasser, medalje i tillegg for topp 3', () => {
    expect(placeLabel(1)).toBe('1 🥇'); expect(placeLabel(2)).toBe('2 🥈'); expect(placeLabel(3)).toBe('3 🥉')
    expect(placeLabel(4)).toBe('4'); expect(placeLabel(12)).toBe('12')
  })
})
