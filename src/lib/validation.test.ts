import { describe, expect, it } from 'vitest'
import { cleanComment, isValidPin, isWeakPin, isValidScore, normalizePin, validateComment, validateDisplayName, validateSlug } from './validation'

describe('validation', () => {
  it('normaliserer pin', () => {
    expect(normalizePin('12a3 456789')).toBe('123456')
    expect(normalizePin('')).toBe('')
  })
  it('validerer pin', () => {
    expect(isValidPin('123456')).toBe(true)
    expect(isValidPin('12345')).toBe(false)
    expect(isValidPin('12345a')).toBe(false)
  })
  it('validerer visningsnavn', () => {
    expect(validateDisplayName(' a ')).not.toBeNull()
    expect(validateDisplayName('Kari')).toBeNull()
    expect(validateDisplayName('x'.repeat(41))).not.toBeNull()
  })
  it('validerer score', () => {
    expect(isValidScore(1)).toBe(true)
    expect(isValidScore(10)).toBe(true)
    expect(isValidScore(0)).toBe(false)
    expect(isValidScore(11)).toBe(false)
    expect(isValidScore(5.5)).toBe(false)
    expect(isValidScore('5')).toBe(false)
  })
  it('kommentar', () => {
    expect(validateComment('x'.repeat(501))).not.toBeNull()
    expect(validateComment('ok')).toBeNull()
    expect(cleanComment('   ')).toBeNull()
    expect(cleanComment(' hei ')).toBe('hei')
  })
  it('slug', () => {
    expect(validateSlug('julebrustest')).toBeNull()
    expect(validateSlug('Jul 2026')).not.toBeNull()
  })
})

describe('isWeakPin', () => {
  it('avviser samme siffer og rene rekker', () => {
    for (const p of ['000000', '111111', '123456', '234567', '654321', '987654', '012345']) expect(isWeakPin(p)).toBe(true)
  })
  it('godtar vanlige koder', () => {
    for (const p of ['482915', '135792', '121212', '100000']) expect(isWeakPin(p)).toBe(false)
  })
  it('regner ikke ugyldig lengde som svak (egen validering)', () => {
    expect(isWeakPin('123')).toBe(false)
  })
})

import { cleanTags, tasteProfile, toggleTag } from './validation'
describe('smaksmerker', () => {
  it('cleanTags beholder bare kjente merker, uten dubletter, i fast rekkefølge', () => {
    expect(cleanTags(['Bitter', 'Ukjent', 'Søt', 'Søt'])).toEqual(['Søt', 'Bitter'])
    expect(cleanTags(null)).toEqual([])
  })
  it('toggleTag slår av og på', () => {
    expect(toggleTag([], 'Sur')).toEqual(['Sur'])
    expect(toggleTag(['Sur', 'Søt'], 'Sur')).toEqual(['Søt'])
    expect(toggleTag(['Søt'], 'Hacket')).toEqual(['Søt'])
  })
  it('tasteProfile sorterer på antall, og skjuler ved færre enn to svar', () => {
    expect(tasteProfile({ Søt: 2, Krydret: 5, Sur: 5 }, 7).map((t) => t.tag)).toEqual(['Krydret', 'Sur', 'Søt'])
    expect(tasteProfile({ Søt: 1 }, 1)).toEqual([])
    expect(tasteProfile({}, 10)).toEqual([])
    expect(tasteProfile({ Hacket: 3 }, 5)).toEqual([])
  })
  it('andel er antall delt på alle som vurderte glasset', () => {
    expect(tasteProfile({ Søt: 3 }, 6)[0].share).toBe(0.5)
  })
})
