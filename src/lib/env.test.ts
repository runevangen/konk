import { describe, expect, it } from 'vitest'
import { cleanEnv, cleanUrl, jwtClaims, resolveSupabaseConfig } from './env'

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

describe('resolveSupabaseConfig', () => {
  const fb = { url: 'https://fallbackproj.supabase.co', key: 'eyJfb.fb.fb' }
  const goodKey = 'eyJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJhYmNkZWZnaGlqIiwicm9sZSI6ImFub24ifQ.sig_123-ABC'
  it('bruker gyldige miljøverdier', () => {
    const r = resolveSupabaseConfig({ url: 'https://abcdefghij.supabase.co/', key: goodKey }, fb)
    expect(r).toEqual({ url: 'https://abcdefghij.supabase.co', key: goodKey, usedFallback: { url: false, key: false } })
  })
  it('renser før validering', () => {
    expect(resolveSupabaseConfig({ url: ' https://abcdefghij.supabase.co ', key: ` "${goodKey}"\u200b ` }, fb).key).toBe(goodKey)
  })
  it('faller tilbake når verdiene mangler eller er ødelagt', () => {
    const r = resolveSupabaseConfig({ url: undefined, key: 'eyJ-ikke-en-jwt' }, fb)
    expect(r.url).toBe(fb.url)
    expect(r.key).toBe(fb.key)
    expect(r.usedFallback).toEqual({ url: true, key: true })
  })
  it('avviser nøkkel fra feil prosjekt og service_role-nøkkel', () => {
    const wrong = resolveSupabaseConfig({ url: 'https://abcdefghij.supabase.co', key: 'eyJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJvdGhlcnByb2p4Iiwicm9sZSI6ImFub24ifQ.sig_123-ABC' }, fb)
    expect(wrong.key).toBe(fb.key)
    expect(wrong.usedFallback.key).toBe(true)
    expect(resolveSupabaseConfig({ url: 'https://abcdefghij.supabase.co', key: 'eyJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJhYmNkZWZnaGlqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSJ9.sig_123-ABC' }, fb).key).toBe(fb.key)
  })
  it('jwtClaims leser ref og role, og gir null for søppel', () => {
    expect(jwtClaims(goodKey)).toEqual({ ref: 'abcdefghij', role: 'anon' })
    expect(jwtClaims('ikke-jwt')).toBeNull()
  })
  it('godtar nye publishable-nøkler', () => {
    expect(resolveSupabaseConfig({ key: 'sb_publishable_AbC-123_x' }, fb).key).toBe('sb_publishable_AbC-123_x')
  })
})
