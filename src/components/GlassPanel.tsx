import { formatPercent, formatScore, pluralize } from '../lib/format'
import { guessDistribution, scoreHistogram, tagCounts, visibleComments, type StatEntry, type StatOption, type StatProfile } from '../lib/glassStats'

export interface PanelOffice { office_id: string | number; name: string; avg_score: number | null; n: number }

/**
 * Alt om ett glass, til storskjermen (admin): fordeling av score, kontorene, hva folk gjettet, smak og kommentarer.
 * Gjetninger, fasit og kommentarer røper hva glasset er, så de er skjult til admin viser dem (eller konkurransen er avsluttet).
 */
export function GlassPanel({ position, label, rank, avg, n, hitRate, byOffice, entries, options, correctId, profiles, officeName, reveal, canToggle, onToggle, onClose }: {
  position: number; label: string | null; rank: number | null; avg: number | null; n: number; hitRate: number | null
  byOffice: PanelOffice[]; entries: StatEntry[]; options: StatOption[]; correctId: string | null | undefined
  profiles: StatProfile[]; officeName: (id: string | number | null) => string; reveal: boolean; canToggle: boolean
  onToggle: () => void; onClose: () => void
}) {
  const hist = scoreHistogram(entries)
  const maxH = Math.max(1, ...hist)
  const guess = guessDistribution(entries, options, correctId)
  const maxG = Math.max(1, ...guess.rows.map((r) => r.count), guess.none)
  const tags = tagCounts(entries).slice(0, 6)
  const comments = visibleComments(entries, profiles, officeName)
  return (
    <aside className="card glasspanel" data-testid="glass-panel" aria-label={`Detaljer for glass ${position}`}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <h3 style={{ margin: 0 }}>Glass {position}{reveal && label ? ` · ${label}` : ''}</h3>
        <button className="btn ghost small" onClick={onClose} aria-label="Lukk" data-testid="panel-lukk">✕</button>
      </div>
      <p className="soft small" style={{ margin: '2px 0 6px' }}>
        {rank != null ? `Plass ${rank} · ` : ''}<strong>{formatScore(avg, 2)}</strong> i snitt · {pluralize(n, 'vurdering', 'vurderinger')}
        {byOffice.filter((o) => o.n > 0 && o.avg_score != null).map((o) => <span key={o.office_id}> · {o.name} <strong>{formatScore(o.avg_score, 1)}</strong></span>)}
      </p>
      <div className="hist" role="img" aria-label="Fordeling av score" data-testid="panel-histogram">
        {hist.map((c, i) => <b key={i} style={{ height: `${Math.max(c ? 8 : 2, (c / maxH) * 100)}%` }} title={`${i + 1}: ${c}`}><span>{i + 1}</span></b>)}
      </div>

      {!reveal ? (
        <div className="panel-lås" data-testid="panel-lås">
          <p style={{ margin: '0 0 6px' }}>🔒 Gjetninger, fasit og kommentarer er skjult mens smakingen pågår.</p>
          {canToggle && <button className="btn gold small" onClick={onToggle} data-testid="panel-vis">Vis for alle</button>}
        </div>
      ) : (
        <>
          <div className="row between" style={{ marginTop: 14 }}><strong>Hva gjettet de?</strong>{hitRate != null && <span className="soft small">{formatPercent(hitRate)} riktig</span>}</div>
          {guess.total === 0 && <p className="soft small" style={{ margin: '4px 0' }}>Ingen gjetninger ennå.</p>}
          {guess.rows.slice(0, 6).map((r) => (
            <div key={r.id} className={`g ${r.correct ? 'ok' : ''}`} data-testid="panel-gjetning">
              <span>{r.correct ? '✓ ' : ''}{r.label}</span><span className="t"><i style={{ width: `${(r.count / maxG) * 100}%` }} /></span><b>{r.count}</b>
            </div>
          ))}
          {guess.none > 0 && <div className="g" data-testid="panel-gjetning"><span>Vet ikke</span><span className="t"><i style={{ width: `${(guess.none / maxG) * 100}%` }} /></span><b>{guess.none}</b></div>}
          {tags.length > 0 && <div style={{ marginTop: 8 }} data-testid="panel-smak">{tags.map((t) => <span key={t.tag} className="chip">{t.tag} {t.count}</span>)}</div>}
          {comments.slice(0, 2).map((c, i) => (
            <blockquote key={i} className="quote" data-testid="panel-kommentar">«{c.text}»<small>{c.featured ? '⭐ Dagens sitat · ' : ''}{c.name} · {c.office}{c.score != null ? ` · ga ${c.score}` : ''}</small></blockquote>
          ))}
          {comments.length > 2 && <p className="soft small" style={{ margin: 0 }}>+ {comments.length - 2} kommentarer til</p>}
          {canToggle && <p style={{ margin: '8px 0 0' }}><button className="btn ghost small" onClick={onToggle} data-testid="panel-skjul">Skjul igjen</button></p>}
        </>
      )}
    </aside>
  )
}
