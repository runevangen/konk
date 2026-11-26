import type { OfficeRow, QuizPlayer, RankRow } from '../../api/quiz'
import { fractionLeft, isOfficeTie, medal, officeWinner, ranked, secondsLeft } from '../../lib/quiz'

export function Countdown({ remaining, totalSeconds, label }: { remaining: number; totalSeconds: number; label: string }) {
  const frac = fractionLeft(remaining, totalSeconds)
  const secs = secondsLeft(remaining)
  return (
    <div>
      <div className="row between small" style={{ marginBottom: 4 }}>
        <span>{label}</span><strong aria-live="off" data-testid="quiz-sekunder">{secs} s</strong>
      </div>
      <div className="countdown" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={totalSeconds} aria-valuenow={secs}>
        <div className={`countdown-fill ${secs <= 5 ? 'low' : ''}`} style={{ width: `${Math.round(frac * 100)}%` }} />
      </div>
    </div>
  )
}

export function PlayersList({ players }: { players: QuizPlayer[] }) {
  if (!players.length) return <p className="soft">Ingen har kommet inn ennå.</p>
  return (
    <ul className="players" aria-label="Spillere i rommet" data-testid="quiz-spillere">
      {players.map((p, i) => (
        <li key={i}><strong>{p.name}</strong>{p.me ? ' (deg)' : ''}{p.host ? ' · vert' : ''} <span className="soft small">· {p.office}</span></li>
      ))}
    </ul>
  )
}

export function RankList({ rows, limit, big = false, compact = false, hideMe = false }: { rows: RankRow[]; limit?: number; big?: boolean; compact?: boolean; hideMe?: boolean }) {
  const all = ranked(rows)
  const shown = limit ? all.slice(0, limit) : all
  const meOut = limit && !hideMe ? all.find((r) => r.row.me && !shown.includes(r)) : undefined
  const line = ({ rank, row }: { rank: number; row: RankRow }, k: string) => (
    <li key={k} className={`rank-row ${row.me ? 'me' : ''} ${big ? 'big' : ''}`} data-testid="quiz-rang">
      <span className="rank-n" aria-label={`Plass ${rank}`}>{medal(rank)}</span>
      <span className="rank-name"><strong>{row.name}</strong>{row.me ? ' (deg)' : ''} <span className="soft small">· {row.office}</span></span>
      <span className="rank-pts"><strong>{row.points}</strong> <span className="soft small">p · {row.correct} riktig</span></span>
    </li>
  )
  return (
    <ol className={`rank-list ${compact ? 'compact' : ''}`} aria-label="Rangering">
      {shown.map((r, i) => line(r, 'r' + i))}
      {meOut && (<><li className="rank-gap" aria-hidden="true">…</li>{line(meOut, 'me')}</>)}
    </ol>
  )
}

export function OfficeBoard({ offices, big = false }: { offices: OfficeRow[]; big?: boolean }) {
  const active = offices.filter((o) => o.players > 0)
  if (!active.length) return null
  const winner = officeWinner(offices)
  const tie = isOfficeTie(offices)
  const max = Math.max(1, ...active.map((o) => o.avg ?? 0))
  return (
    <div className={`office-board ${big ? 'big' : ''}`} data-testid="quiz-kontorer">
      <p className="small soft" style={{ margin: '0 0 8px' }}>
        {tie ? 'Uavgjort mellom kontorene.' : winner ? <><strong>{winner.office}</strong> leder (høyest snitt per spiller).</> : null}
      </p>
      {[...active].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0) || b.points - a.points).map((o) => (
        <div key={o.office} className="bar-row" data-testid="quiz-kontor">
          <span><strong>{o.office}</strong></span>
          <strong>{o.avg ?? 0} <span className="soft small">snitt</span></strong>
          <div className="bar"><i style={{ width: `${Math.round(((o.avg ?? 0) / max) * 100)}%` }} /></div>
          <span className="soft small" style={{ gridColumn: '1 / -1' }}>{o.players} {o.players === 1 ? 'spiller' : 'spillere'} · {o.points} poeng totalt</span>
        </div>
      ))}
    </div>
  )
}

export const LETTERS = ['A', 'B', 'C', 'D']

/** Nedtelling før første spørsmål: en gave med ring som tømmes, rister de siste tre sekundene og åpnes ved 0. */
export function GiftCountdown({ remaining, total = 10, big = false }: { remaining: number; total?: number; big?: boolean }) {
  const secs = secondsLeft(remaining)
  const frac = fractionLeft(remaining, total)
  const last = secs <= 3 && remaining > 0
  const open = remaining <= 0
  return (
    <div className={`gift-wrap ${big ? 'big' : ''}`} data-testid="quiz-nedtelling" role="timer" aria-label={`Quizen starter om ${secs} sekunder`}>
      <div className="gift-stack">
        <div className="gift-ring" style={{ ['--p' as string]: `${Math.round(frac * 360)}deg` }} />
        <div className={`gift-emoji ${last ? 'shake' : ''}`} aria-hidden="true">{open ? '🎉' : '🎁'}</div>
      </div>
      <div key={secs} className={`gift-num ${last ? 'last' : ''}`} data-testid="quiz-nedtelling-tall">{open ? 'Kjør!' : secs}</div>
      <p className="gift-label">{open ? 'Første spørsmål kommer …' : 'Quizen starter om …'}</p>
    </div>
  )
}
