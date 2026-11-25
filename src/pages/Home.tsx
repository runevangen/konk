import { Link } from 'react-router-dom'
import { countItems, listCompetitions, myProgress } from '../api/data'
import type { Competition } from '../api/types'
import { useAuth } from '../auth'
import { ErrorBox, Loading, Progress, StatusBadge } from '../components/ui'
import { useAsync } from '../hooks'

interface Row { c: Competition; done: number; total: number }

async function load(): Promise<Row[]> {
  const comps = await listCompetitions(false)
  return Promise.all(comps.map(async (c) => {
    const [done, total] = await Promise.all([myProgress(c.id).catch(() => 0), countItems(c.id).catch(() => 0)])
    return { c, done, total }
  }))
}

export default function Home() {
  const { profile } = useAuth()
  const { data, error, loading } = useAsync(load, [])
  return (
    <>
      <h1>God jul{profile ? `, ${profile.display_name}` : ''}!</h1>
      <p className="muted-on-bg">Velg en konkurranse.</p>
      {loading && <Loading />}
      {error != null && <ErrorBox error={error} />}
      {data && data.length === 0 && <div className="card"><p>Ingen konkurranser er åpnet ennå. Kom tilbake snart.</p></div>}
      {data?.map(({ c, done, total }) => (
        <Link key={c.id} to={c.status === 'closed' ? `/k/${c.slug}/resultat` : done > 0 ? `/k/${c.slug}/mine` : `/k/${c.slug}`} className="card comp-link">
          <div className="row between">
            <h2 style={{ margin: 0 }}>{c.title}</h2>
            <StatusBadge status={c.status} />
          </div>
          {c.status === 'open' && (
            <div style={{ marginTop: 12 }}>
              <p className="soft small" style={{ margin: '0 0 6px' }}>{done} av {total} glass smakt</p>
              <Progress value={done} max={total} label={`Fremdrift ${c.title}`} />
            </div>
          )}
          <p className="small" style={{ margin: '10px 0 0', color: 'var(--red)', fontWeight: 700 }}>
            {c.status === 'closed' ? 'Se resultatene →' : done > 0 ? 'Se og endre svarene dine →' : 'Begynn å smake →'}
          </p>
        </Link>
      ))}
    </>
  )
}
