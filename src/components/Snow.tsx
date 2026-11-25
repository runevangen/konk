const FLAKES = Array.from({ length: 26 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 97.13 + n * 12.9898) * 43758.5453) % 1 + 1) % 1
  return {
    x: `${Math.round(r(1) * 100)}%`,
    s: `${(3 + r(2) * 5).toFixed(1)}px`,
    d: `${(9 + r(3) * 12).toFixed(1)}s`,
    delay: `${(-r(4) * 20).toFixed(1)}s`,
    drift: `${Math.round(-40 + r(5) * 80)}px`,
  }
})

/** Dekorativ snø. Skjules helt via CSS ved prefers-reduced-motion. */
export default function Snow() {
  return (
    <div className="snow" aria-hidden="true">
      {FLAKES.map((f, i) => (
        <i key={i} style={{ ['--x' as string]: f.x, ['--s' as string]: f.s, ['--d' as string]: f.d, ['--delay' as string]: f.delay, ['--drift' as string]: f.drift }} />
      ))}
    </div>
  )
}
