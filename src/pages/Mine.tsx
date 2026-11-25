import { Link, useParams } from 'react-router-dom'
import { getCompetition, listItems, listMyEntries, listOptions } from '../api/data'
import { useAuth } from '../auth'
import { ErrorBox, Loading, StatusBadge } from '../components/ui'
import { useAsync } from '../hooks'

/** Oversikt over alle egne svar i en konkurranse: score, gjetting og kommentar per glass, med lenke for å endre. */
export default function Mine() {
  const { slug = '' } = useParams()
  const { session } = useAuth()
  const uid = session!.user.id
  const { data, error, loading } = useAsync(async () => {
    const comp = await getCompetition(slug)
    if (!comp) return null
    const [items, options] = await Promise.all([listItems(comp.id), listOptions(comp.id)])
    const entries = await listMyEntries(uid, items.map((i) => i.id))
    return { comp, items, options, entries }
  }, [slug, uid])

  if (loading && !data) return <Loading />
  if (error != null) return <ErrorBox error={error} />
  if (!data) return <div className="card"><h1>Fant ikke konkurransen</h1><Link to="/">Til forsiden</Link></div>
  const { comp, items, options, entries } = data
  const byItem = new Map(entries.map((e) => [e.item_id, e]))
  const answered = items.filter((i) => byItem.has(i.id)).length
  const open = comp.status === 'open'
  const guessLabel = (id: string | null) => (id ? options.find((o) => o.id === id)?.label ?? '?' : 'Vet ikke')

  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>Mine svar</h1>
        <StatusBadge status={comp.status} />
      </div>
      <p className="muted-on-bg" style={{ margin: '0 0 12px' }}>{comp.title} · {answered} av {items.length} glass besvart</p>

      {items.map((it, i) => {
        const e = byItem.get(it.id)
        return (
          <section key={it.id} className="card" aria-label={`Glass ${i + 1}`}>
            <div className="row between">
              <h2 style={{ margin: 0 }}>Glass {i + 1}</h2>
              {open && <Link className="btn green small" to={`/k/${comp.slug}?glass=${i + 1}`}>{e ? 'Endre' : 'Svar'}</Link>}
            </div>
            {e ? (
              <>
                <p style={{ margin: '10px 0 4px' }}><strong>Score:</strong> <span data-testid={`score-${i + 1}`}>{e.score}</span> av 10</p>
                <p style={{ margin: '0 0 4px' }}><strong>Gjetter på:</strong> {guessLabel(e.guess_option_id)}</p>
                <p style={{ margin: 0 }}><strong>Kommentar:</strong> {e.comment ? e.comment : <span className="soft">ingen</span>}</p>
              </>
            ) : (
              <p className="soft" style={{ margin: '10px 0 0' }}>Ikke besvart ennå.</p>
            )}
          </section>
        )
      })}

      <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {open && answered < items.length && <Link className="btn gold" to={`/k/${comp.slug}`}>Fortsett å smake →</Link>}
        {comp.status === 'closed' && <Link className="btn gold" to={`/k/${comp.slug}/resultat`}>Se resultatene →</Link>}
        <Link className="btn gold" to="/">Til forsiden</Link>
      </p>
    </>
  )
}
