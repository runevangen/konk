import { describe, expect, it } from 'vitest'
import { cleanLine, fasitText, newOptionNames, normalizeName, parseFasitList } from './fasit'

const OPTS = ['Askim', 'Gamlebyen', 'Færder', 'Hamar', 'Ringnes', 'Safteriet']

describe('cleanLine', () => {
  it('fjerner nummerering og punkttegn', () => {
    expect(cleanLine('1. Askim')).toBe('Askim')
    expect(cleanLine('Glass 2: Hamar')).toBe('Hamar')
    expect(cleanLine('3) Ringnes')).toBe('Ringnes')
    expect(cleanLine('- Færder')).toBe('Færder')
    expect(cleanLine('* Safteriet')).toBe('Safteriet')
  })
  it('fjerner alle merknader i parentes', () => {
    expect(cleanLine('Askim (N)')).toBe('Askim')
    expect(cleanLine('Safteriet (Oslo?) (N)')).toBe('Safteriet')
    expect(cleanLine('Gamle (A) Byen (B)')).toBe('Gamle Byen')
  })
  it('lar tall som er en del av navnet stå', () => {
    expect(cleanLine('7UP')).toBe('7UP')
  })
})

describe('parseFasitList', () => {
  it('matcher rekkefølge og skrivemåte, uavhengig av store og små bokstaver', () => {
    const rows = parseFasitList('safteriet\nGAMLEBYEN\n  Færder  \n', OPTS)
    expect(rows.map((r) => [r.pos, r.match])).toEqual([[1, 'Safteriet'], [2, 'Gamlebyen'], [3, 'Færder']])
    expect(rows.every((r) => !r.isNew)).toBe(true)
  })
  it('hopper over tomme linjer og tåler Windows-linjeskift', () => {
    const rows = parseFasitList('Hamar\r\n\r\nAskim\r\n', OPTS)
    expect(rows.map((r) => r.name)).toEqual(['Hamar', 'Askim'])
    expect(rows.map((r) => r.pos)).toEqual([1, 2])
  })
  it('godtar entydig prefiks, men ikke tvetydig', () => {
    expect(parseFasitList('ring', OPTS)[0].match).toBe('Ringnes')
    expect(parseFasitList('a', ['Askim', 'Aker'])[0].match).toBeNull()
  })
  it('markerer ukjente navn som nye', () => {
    const rows = parseFasitList('Hamar\nVørterbrus', OPTS)
    expect(rows[1]).toMatchObject({ match: null, isNew: true, name: 'Vørterbrus' })
  })
  it('markerer samme brus på flere glass', () => {
    const rows = parseFasitList('Hamar\nAskim\nhamar', OPTS)
    expect(rows.map((r) => r.duplicate)).toEqual([true, false, true])
  })
  it('fungerer for lista fra eier (med numre og merknader)', () => {
    const rows = parseFasitList('1. Safteriet (Oslo?) (N)\n2. Gamlebyen\n3. Færder (N)\n4. Hamar (T)\n5. Ringnes (T)\n6. Askim (N)', OPTS)
    expect(rows.map((r) => r.match)).toEqual(['Safteriet', 'Gamlebyen', 'Færder', 'Hamar', 'Ringnes', 'Askim'])
    expect(rows.every((r) => !r.isNew && !r.duplicate)).toBe(true)
  })
  it('tom liste gir ingen rader', () => {
    expect(parseFasitList('  \n\n', OPTS)).toEqual([])
  })
})

describe('newOptionNames', () => {
  it('gir unike nye navn, første skrivemåte beholdes', () => {
    const rows = parseFasitList('Ny Brus\nHamar\nny   brus\nAnnen', OPTS)
    expect(newOptionNames(rows)).toEqual(['Ny Brus', 'Annen'])
  })
})

describe('normalizeName og fasitText', () => {
  it('normaliserer mellomrom og store bokstaver', () => {
    expect(normalizeName('  Gamle   Byen ')).toBe('gamle byen')
  })
  it('lager «Glass N: brus»-linjer, med – når fasit mangler', () => {
    expect(fasitText([{ pos: 1, brus: 'Hamar' }, { pos: 2, brus: null }])).toBe('Glass 1: Hamar\nGlass 2: –')
  })
})
