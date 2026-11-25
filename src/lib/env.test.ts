import { describe, expect, it } from 'vitest'
import { cleanEnv, cleanUrl } from './env'

describe('cleanEnv', () => {
  it('lar en gyldig nøkkel være uendret', () => {
    const k = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abc-DEF_123'
    expect(cleanEnv(k)).toBe(k)
  })
  it('fjerner mellomrom, linjeskift og usynlige tegn', () => {
    expect(cleanEnv(' abc.def\n.ghi​ ')).toBe('abc.def.ghi')
    expect(cleanEnv('abc def')).toBe('abcdef')
  })
  it('fjerner ikke-ISO-8859-1-tegn som tankestrek og ellipse', () => {
    expect(cleanEnv('abc…def–ghi')).toBe('abcdefghi')
  })
  it('fjerner anførselstegn rundt verdien', () => {
    expect(cleanEnv('"abc.def"')).toBe('abc.def')
    expect(cleanEnv("'abc'")).toBe('abc')
  })
  it('håndterer tom/undefined', () => {
    expect(cleanEnv(undefined)).toBe('')
    expect(cleanEnv(null)).toBe('')
  })
})

describe('cleanUrl', () => {
  it('fjerner avsluttende skråstrek', () => {
    expect(cleanUrl('https://x.supabase.co/')).toBe('https://x.supabase.co')
    expect(cleanUrl(' https://x.supabase.co \n')).toBe('https://x.supabase.co')
  })
})
