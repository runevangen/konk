import { errorMessage } from '../api/functions'

export function Loading({ text = 'Laster …' }: { text?: string }) {
  return <p role="status" className="muted-on-bg">{text}</p>
}
export function ErrorBox({ error }: { error: unknown }) {
  return <div className="on-bg-error" role="alert">{errorMessage(error)}</div>
}
export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
export function StatusBadge({ status }: { status: 'draft' | 'open' | 'closed' }) {
  const t = { draft: 'Utkast', open: 'Åpen', closed: 'Avsluttet' }[status]
  return <span className={`badge ${status}`}>{t}</span>
}
