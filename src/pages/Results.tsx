import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addFeedback, deleteFeedback, getCompetition, getFeedback, getResults, listMyFeedback } from '../api/data'
import { errorMessage } from '../api/functions'
import type { FeedbackRow, Id, MyFeedback, Results as R, ResultsItem } from '../api/types'
import { useAuth } from '../auth'
import { ErrorBox, Loading } from '../components/ui'
import { useAsync } from '../hooks'
import { REACTIONS } from '../lib/emoji'
import { formatPercent, formatScore, pluralize, rankBy, scoreBarWidth } from '../lib/format'
import { COMMENT_MAX, cleanComment, tasteProfile } from '../lib/validation'

export default function Results() {
  const { slug = '' } = useParams()
  const { session, profile } = useAuth()
  const uid = session!.user.id
  const { data, error, loading, reload } = useAsync(async () => {
    const comp = await getCompetition(slug)
    if (!comp) return null
    if (comp.status !== 'closed' && !profile?.is_admin) return { comp, results: null, feedback: [], mine: [] as MyFeedback[] }
    const [results, feedback, mine] = await Promise.all([getResults(comp.id), getFeedback(comp.id), listMyFeedback(uid, comp.id)])
    return { comp, results, feedback, mine }
  }, [slug, uid, profile?.is_admin])

  if (loading && !data) return <Loading />
  if (error != null) return <ErrorBox error={error} />
  if (!data) return <div className="card"><h1>Fant ikke konkurransen</h1><Link to="/">Til forsiden</Link></div>
  const { comp, results, feedback, mine } = data
  if (!results) {
    return (
      <div className="card">
        <h1>{comp.title}</h1>
        <p>Resultatene er ikke klare ennå. De vises når konkurransen er avsluttet.</p>
        <Link className="btn" to={`/k/${comp.slug}`}>Tilbake til smaking</Link>
      </div>
    )
  }
  return <ResultView uid={uid} compId={comp.id} slug={comp.slug} title={comp.title} results={results} feedback={feedback} mine={mine} reload={reload} />
}

function ResultView({ uid, compId, slug, title, results, feedback, mine, reload }: {
  uid: Id; compId: Id; slug: string; title: string; results: R; feedback: FeedbackRow[]; mine: MyFeedback[]; reload: () => Promise<void>
}) {
  const [err, setErr] = useState<string | null>(null)
  const ranked = rankBy(results.items, (i) => i.avg_score)
  const offices = rankBy(results.offices, (o) => o.avg_score)
  const itemFb = (id: Id) => feedback.filter((f) => f.target === 'item' && f.item_id === id)

  async function toggleReaction(target: 'item' | 'result', itemId: Id | null, emoji: string) {
    setErr(null)
    try {
      const existing = mine.find((m) => m.target === target && m.item_id === itemId && m.emoji === emoji && !m.comment)
      if (existing) await deleteFeedback(existing.id)
      else await addFeedback({ user_id: uid, competition_id: compId, item_id: itemId, target, emoji, comment: null })
      await reload()
    } catch (e) { setErr(errorMessage(e)) }
  }
  async function sendComment(target: 'item' | 'result', itemId: Id | null, comment: string) {
    setErr(null)
    try {
      await addFeedback({ user_id: uid, competition_id: compId, item_id: itemId, target, emoji: null, comment: cleanComment(comment) })
      await reload()
    } catch (e) { setErr(errorMessage(e)); throw e }
  }

  return (
    <>
      <h1>Resultat: {title}</h1>
      <p><Link className="btn gold" to={`/k/${slug}/mine`} data-testid="til-mine-gjetninger">🎯 Se hva du gjettet</Link></p>
      {err && <div className="on-bg-error" role="alert">{err}</div>}

      <section className="card" aria-labelledby="tot">
        <h2 id="tot">Totalt</h2>
        <div className="stat-grid">
          <div className="stat"><b>{formatScore(results.overall.avg)}</b><span className="small">snittscore</span></div>
          <div className="stat"><b>{formatPercent(results.overall.hit_rate)}</b><span className="small">treff</span></div>
          <div className="stat"><b>{results.overall.participants}</b><span className="small">deltakere</span></div>
        </div>
        <p className="soft small" style={{ marginTop: 10 }}>{pluralize(results.overall.n_entries, 'vurdering', 'vurderinger')} totalt.</p>
      </section>

      <section className="card" aria-labelledby="kontor">
        <h2 id="kontor">Kontor mot kontor</h2>
        {offices.map(({ rank, row }) => (
          <div className="bar-row" key={row.office_id}>
            <span><span className="rank" style={{ width: 28, height: 28, marginRight: 8 }}>{rank}</span><strong>{row.name}</strong></span>
            <span><strong>{formatScore(row.avg_score)}</strong> <span className="soft small">· {formatPercent(row.hit_rate)} treff · {pluralize(row.participants, 'deltaker', 'deltakere')}</span></span>
            <div className="bar" aria-hidden="true"><i style={{ width: `${scoreBarWidth(row.avg_score)}%` }} /></div>
          </div>
        ))}
      </section>

      <section aria-labelledby="rangering">
        <h2 id="rangering" style={{ color: 'var(--on-bg)' }}>Rangering av glassene</h2>
        {ranked.map(({ rank, row }) => (
          <ItemResult key={row.item_id} rank={rank} item={row} comments={results.comments.filter((c) => c.item_id === row.item_id)}
            fb={itemFb(row.item_id)} mine={mine.filter((m) => m.target === 'item' && m.item_id === row.item_id)}
            onReact={(e) => toggleReaction('item', row.item_id, e)} />
        ))}
      </section>

      <section className="card" aria-labelledby="fb">
        <h2 id="fb">Hva syntes du om konkurransen?</h2>
        <Reactions mine={mine.filter((m) => m.target === 'result')} onReact={(e) => toggleReaction('result', null, e)} />
        <CommentForm onSend={(c) => sendComment('result', null, c)} label="Kommentar til konkurransen" />
        {feedback.filter((f) => f.target === 'result').length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Tally rows={feedback.filter((f) => f.target === 'result')} />
            <FeedbackComments rows={feedback.filter((f) => f.target === 'result')} />
          </div>
        )}
      </section>
    </>
  )
}

function Tally({ rows }: { rows: FeedbackRow[] }) {
  const counts = REACTIONS.map((r) => ({ ...r, n: rows.filter((f) => f.emoji === r.emoji).length })).filter((r) => r.n > 0)
  if (!counts.length) return null
  return <p className="row" aria-label="Reaksjoner">{counts.map((c) => <span key={c.emoji} title={c.label}>{c.emoji} <strong>{c.n}</strong></span>)}</p>
}
function FeedbackComments({ rows }: { rows: FeedbackRow[] }) {
  return <>{rows.filter((f) => f.comment).map((f) => (
    <div className="comment" key={f.id}>{f.comment}<div className="who">{f.display_name ?? 'Anonym'} · {f.office_name}</div></div>
  ))}</>
}

function Reactions({ mine, onReact }: { mine: MyFeedback[]; onReact: (emoji: string) => void }) {
  return (
    <div className="react-row" role="group" aria-label="Reaksjoner">
      {REACTIONS.map((r) => (
        <button key={r.emoji} className="react" aria-pressed={mine.some((m) => m.emoji === r.emoji)} onClick={() => onReact(r.emoji)} aria-label={r.label}>
          <span aria-hidden="true">{r.emoji}</span><small>{r.label}</small>
        </button>
      ))}
    </div>
  )
}

function CommentForm({ onSend, label }: { onSend: (c: string) => Promise<void>; label: string }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!cleanComment(text)) return
    setBusy(true)
    try { await onSend(text); setText('') } catch { /* feilen vises øverst */ }
    setBusy(false)
  }
  return (
    <form onSubmit={submit} style={{ marginTop: 12 }}>
      <label className="field">{label}
        <textarea value={text} maxLength={COMMENT_MAX} onChange={(e) => setText(e.target.value)} style={{ minHeight: 72 }} />
      </label>
      <button className="btn green small" disabled={busy || !cleanComment(text)}>Send</button>
    </form>
  )
}

function ItemResult({ rank, item, comments, fb, mine, onReact }: {
  rank: number; item: ResultsItem; comments: R['comments']; fb: FeedbackRow[]; mine: MyFeedback[]; onReact: (e: string) => void
}) {
  return (
    <details className="rank-item" style={{ color: 'var(--ink)' }}>
      <summary>
        <span className={`rank ${rank === 1 ? 'r1' : ''}`} aria-label={`Plass ${rank}`}>{rank}</span>
        <span className="sum-main"><strong>Glass {item.position}{item.correct_label ? ` – ${item.correct_label}` : ''}</strong><br />
          <span className="soft small">Plass {rank} · {item.correct_label ? 'Fasit satt' : 'Fasit ikke satt'} · {formatPercent(item.hit_rate)} gjettet riktig</span></span>
        <span className="sum-score">{formatScore(item.avg_score)}</span>
      </summary>
      <div className="inner">
        <div className="bar red" aria-hidden="true"><i style={{ width: `${scoreBarWidth(item.avg_score)}%` }} /></div>
        <p className="soft small" style={{ marginTop: 6 }}>Glass {item.position}{item.correct_label ? `: fasit ${item.correct_label}` : ''} · {pluralize(item.n, 'vurdering', 'vurderinger')}</p>
        {comments.filter((c) => c.featured).slice(0, 1).map((c, i) => (
          <blockquote className="quote" key={`q${i}`} data-testid="dagens-sitat">«{c.comment}»<div className="who">⭐ Dagens sitat · {c.display_name ?? 'Anonym'} · {c.office_name}</div></blockquote>
        ))}
        {item.by_office.length > 0 && (
          <table className="t" aria-label="Snitt per kontor"><tbody>
            {item.by_office.map((o) => <tr key={o.office_id}><td>{o.name}</td><td><strong>{formatScore(o.avg_score)}</strong></td><td className="soft small">{o.n} vurd.</td></tr>)}
          </tbody></table>
        )}
        {tasteProfile(item.tags, item.n).length > 0 && (
          <div data-testid="smaksprofil" style={{ marginTop: 12 }}>
            <h3 style={{ margin: '0 0 4px' }}>Smak</h3>
            {tasteProfile(item.tags, item.n).slice(0, 5).map((t) => (
              <div className="taste-row" key={t.tag}><span className="lbl">{t.tag}</span><span className="bar" aria-hidden="true"><i style={{ width: `${Math.round(t.share * 100)}%` }} /></span><span className="soft small">{t.count} av {item.n}</span></div>
            ))}
          </div>
        )}
        {comments.some((c) => !c.featured) && <h3 style={{ marginTop: 12 }}>Kommentarer</h3>}
        {comments.filter((c) => !c.featured || comments.filter((x) => x.featured).indexOf(c) > 0).map((c, i) => (
          <div className="comment" key={i}>{c.comment}<div className="who">{c.display_name ?? 'Anonym'} · {c.office_name} · ga {c.score}</div></div>
        ))}
        <h3 style={{ marginTop: 12 }}>Din reaksjon</h3>
        <Reactions mine={mine} onReact={onReact} />
        <div style={{ marginTop: 8 }}><Tally rows={fb} /><FeedbackComments rows={fb} /></div>
      </div>
    </details>
  )
}
