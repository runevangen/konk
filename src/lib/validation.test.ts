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
