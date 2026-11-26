import { describe, expect, it } from 'vitest'
import { importable, markDuplicates, parseCorrect, parseCsvTable, parseQuizText, questionKey, toExportJson, validateQuestion } from './quizImport'

// Oppdiktede spørsmål: ekte quizer skal aldri ligge i repoet (det er offentlig).
const Q = (nr: number, over: Record<string, unknown> = {}) => ({
  nr, kategori: 'Test', vanskelighet: 'Lett', spoersmaal: `Spørsmål nummer ${nr}?`,
  alternativer: { A: 'Alfa', B: 'Beta', C: 'Gamma', D: 'Delta' }, riktig: 'B', forklaring: 'Fordi.', kilde: '', ...over,
})

describe('parseCorrect', () => {
  it('tolker bokstav, tall og alternativtekst', () => {
    const o = ['Alfa', 'Beta', 'Gamma', 'Delta']
    expect(parseCorrect('c', o)).toBe(2)
    expect(parseCorrect('D', o)).toBe(3)
    expect(parseCorrect('1', o)).toBe(0)
    expect(parseCorrect(' beta ', o)).toBe(1)
    expect(parseCorrect('E', o)).toBeNull()
    expect(parseCorrect('5', o)).toBeNull()
    expect(parseCorrect('', o)).toBeNull()
  })
})

describe('parseQuizText: JSON', () => {
  it('leser eierformatet (norske nøkler, A–D)', () => {
    const r = parseQuizText(JSON.stringify([Q(1), Q(2, { riktig: 'D' })]), 'jul')
    expect(r.format).toBe('json')
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0].question).toMatchObject({ theme: 'jul', category: 'Test', difficulty: 'Lett', correct: 1, options: ['Alfa', 'Beta', 'Gamma', 'Delta'], source: null })
    expect(r.rows[1].question?.correct).toBe(3)
    expect(r.rows.every((x) => x.errors.length === 0)).toBe(true)
  })
  it('tåler engelske nøkler, array-alternativer, objekt med questions og BOM', () => {
    const r = parseQuizText('﻿' + JSON.stringify({ questions: [{ question: 'Hva er to pluss to?', options: ['3', '4', '5', '6'], correct: 2, explanation: 'Fire.' }] }), 'matte')
    expect(r.rows[0].question).toMatchObject({ theme: 'matte', correct: 1, options: ['3', '4', '5', '6'] })
  })
  it('tema i filen vinner over standardtema', () => {
    const r = parseQuizText(JSON.stringify([Q(1, { tema: 'sport' })]), 'jul')
    expect(r.rows[0].question?.theme).toBe('sport')
  })
  it('gir tydelige feil per spørsmål', () => {
    const r = parseQuizText(JSON.stringify([
      Q(1, { alternativer: { A: 'Alfa', B: 'alfa', C: 'Gamma', D: 'Delta' } }),
      Q(2, { riktig: 'F' }),
      Q(3, { alternativer: { A: 'Alfa', B: '', C: 'Gamma', D: 'Delta' } }),
      Q(4, { spoersmaal: 'Ja' }),
      Q(5, { forklaring: 'x'.repeat(501) }),
      Q(6),
    ]), 'jul')
    expect(r.rows[0].errors.join(' ')).toContain('ulike')
    expect(r.rows[1].errors.join(' ')).toContain('Riktig svar')
    expect(r.rows[2].errors.join(' ')).toContain('Alternativ B er tomt')
    expect(r.rows[3].errors.join(' ')).toContain('Spørsmålet må være')
    expect(r.rows[4].errors.join(' ')).toContain('Forklaringen er for lang')
    expect(r.rows[5].errors).toEqual([])
    expect(r.rows.map((x) => x.line)).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('feil JSON og feil form gir en forståelig melding', () => {
    expect(parseQuizText('[{"a":', 'jul').fatal).toContain('Ugyldig JSON')
    expect(parseQuizText('{"x":1}', 'jul').fatal).toContain('liste')
  })
  it('ikke-objekter i lista avvises som rad', () => {
    expect(parseQuizText('[1, "x"]', 'jul').rows.every((r) => r.errors.length === 1)).toBe(true)
  })
})

describe('parseQuizText: CSV', () => {
  it('leser semikolon med anførselstegn og komma inni felt', () => {
    const csv = 'kategori;vanskelighet;spørsmål;A;B;C;D;riktig;forklaring;kilde\nTest;Lett;"Hva heter «a, b»?";Alfa;Beta;Gamma;Delta;C;"Fordi ""sånn""";https://eksempel.no'
    const r = parseQuizText(csv, 'jul')
    expect(r.format).toBe('csv')
    expect(r.rows[0].question).toMatchObject({ question: 'Hva heter «a, b»?', correct: 2, explanation: 'Fordi "sånn"', source: 'https://eksempel.no', category: 'Test' })
  })
  it('leser tabulator (limt inn fra regneark) og komma', () => {
    const tsv = 'spørsmål\tA\tB\tC\tD\triktig\nEn?\t1\t2\t3\t4\tA'
    expect(parseQuizText(tsv, 'jul').rows[0].question?.options).toEqual(['1', '2', '3', '4'])
    const comma = 'spoersmaal,a,b,c,d,riktig\nTo?,x,y,z,w,d'
    expect(parseQuizText(comma, 'jul').rows[0].question?.correct).toBe(3)
  })
  it('mangler kolonner gir feilmelding', () => {
    expect(parseQuizText('spørsmål;A;B\nx;1;2', 'jul').fatal).toContain('mangler kolonner')
  })
  it('parseCsvTable tåler linjeskift i felt og Windows-linjeskift', () => {
    expect(parseCsvTable('a;"b\nc";d\r\n1;2;3\r\n', ';')).toEqual([['a', 'b\nc', 'd'], ['1', '2', '3']])
  })
})

describe('kvalitetssikring: kildenivå, status og merknad', () => {
  it('leser kilde_nivaa, status og merknad fra JSON', () => {
    const r = parseQuizText(JSON.stringify([
      Q(1, { kilde_nivaa: 2, status: 'OK', merknad: '' }),
      Q(2, { kilde_nivaa: 3, status: 'Usikker', merknad: 'Bygger på andres forskning.', kilde: 'https://a.no | https://b.no' }),
      Q(3),
    ]), 'jul')
    expect(r.rows.map((x) => [x.question?.sourceLevel, x.question?.reviewStatus, x.question?.reviewNote])).toEqual([[2, 'ok', null], [3, 'usikker', 'Bygger på andres forskning.'], [null, null, null]])
    expect(r.rows[1].question?.source).toBe('https://a.no | https://b.no')
  })
  it('avviser ukjent status og ugyldig kildenivå', () => {
    const r = parseQuizText(JSON.stringify([Q(1, { status: 'Kanskje' }), Q(2, { kilde_nivaa: 9 }), Q(3, { kilde_nivaa: 'x' })]), 'jul')
    expect(r.rows[0].errors.join(' ')).toContain('Ukjent status')
    expect(r.rows[1].errors.join(' ')).toContain('Kildenivå')
    expect(r.rows[2].errors.join(' ')).toContain('Kildenivå')
  })
  it('leser kolonnene fra CSV', () => {
    const csv = 'spørsmål;A;B;C;D;riktig;kildenivå;status;merknad\nEn?;a;b;c;d;A;1;Usikker;Se kilden'
    expect(parseQuizText(csv, 'jul').rows[0].question).toMatchObject({ sourceLevel: 1, reviewStatus: 'usikker', reviewNote: 'Se kilden' })
  })
  it('eksporten tar med feltene og kan leses inn igjen', () => {
    const r = parseQuizText(JSON.stringify([Q(1, { kilde_nivaa: 2, status: 'Usikker', merknad: 'Mangler rotkilde' })]), 'jul')
    const again = parseQuizText(toExportJson(r.rows.map((x) => x.question!)), 'jul')
    expect(again.rows[0].question).toMatchObject({ sourceLevel: 2, reviewStatus: 'usikker', reviewNote: 'Mangler rotkilde' })
  })
})

describe('parseQuizText: andre tilfeller', () => {
  it('tom tekst og ukjent format', () => {
    expect(parseQuizText('  \n', 'jul').format).toBe('tom')
    expect(parseQuizText('bare tekst', 'jul').format).toBe('ukjent')
  })
})

describe('dubletter', () => {
  it('finner dubletter i fila og mot banken, uavhengig av store bokstaver og mellomrom', () => {
    const r = parseQuizText(JSON.stringify([Q(1), Q(2, { spoersmaal: '  SPØRSMÅL   nummer 1?' }), Q(3), Q(4, { spoersmaal: 'Finnes fra før?' })]), 'jul')
    const rows = markDuplicates(r.rows, new Set([questionKey('jul', 'Finnes fra før?')]))
    expect(rows.map((x) => x.duplicate)).toEqual([null, 'file', null, 'bank'])
    expect(importable(rows).map((x) => x.line)).toEqual([1, 3])
  })
  it('samme spørsmål i ulike temaer er ikke dublett', () => {
    expect(questionKey('jul', 'Hei?')).not.toBe(questionKey('sport', 'Hei?'))
  })
})

describe('validateQuestion og eksport', () => {
  it('avviser tomt tema', () => {
    expect(validateQuestion({ theme: ' ', question: 'Hva?', options: ['a', 'b', 'c', 'd'], correct: 0 }).join(' ')).toContain('Temaet')
  })
  it('eksport kan leses inn igjen uendret', () => {
    const r = parseQuizText(JSON.stringify([Q(1), Q(2, { riktig: 'A', kilde: 'https://x.no', tema: 'quiz' })]), 'jul')
    const qs = r.rows.map((x) => x.question!)
    const again = parseQuizText(toExportJson(qs), 'jul')
    expect(again.rows.map((x) => x.question)).toEqual(qs)
  })
})
