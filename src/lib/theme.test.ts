import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
const tok = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,6})`))
  if (!m) throw new Error(`token --${name} mangler`)
  return m[1]
}

// [forgrunn, bakgrunn, minimum]  (4.5 = AA normal tekst, 3 = AA ikke-tekst/stor tekst)
const pairs: [string, string, number][] = [
  ['ink', 'card', 4.5],
  ['ink-soft', 'card', 4.5],
  ['red', 'card', 4.5],
  ['green', 'card', 4.5],
  ['on-red', 'red', 4.5],
  ['on-green', 'green', 4.5],
  ['on-gold', 'gold', 4.5],
  ['on-bg', 'bg', 4.5],
  ['on-bg-soft', 'bg', 4.5],
  ['on-bg-soft', 'bg-2', 4.5],
  ['gold', 'bg', 4.5],
  ['ink', 'card-alt', 4.5],
  ['ink-soft', 'card-alt', 4.5],
  ['focus', 'card', 3],
  ['border-strong', 'card', 3],
  ['focus-ring', 'bg', 3],
  ['focus', 'focus-ring', 3],
]

describe('juletema kontrast (WCAG AA)', () => {
  for (const [fg, bg, min] of pairs) {
    it(`--${fg} på --${bg} >= ${min}`, () => {
      expect(contrastRatio(tok(fg), tok(bg))).toBeGreaterThanOrEqual(min)
    })
  }
})
