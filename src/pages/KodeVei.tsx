import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { competitionByCode } from '../api/data'
import { errorMessage } from '../api/functions'
import { quizJoin } from '../api/quiz'
import { Loading } from '../components/ui'
import { isCode, normalizeCode } from '../lib/quiz'

/** `/kode/ABCD`: koden fra en QR-kode eller et skjermbilde. Først en konkurranse, ellers et quiz-rom. */
export default function KodeVei() {
  const { kode = '' } = useParams()
  const code = normalizeCode(kode)
  const nav = useNavigate()
  const [msg, setMsg] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    if (!isCode(code)) { setMsg('Koden er fire bokstaver.'); return }
    void (async () => {
      try {
        const comp = await competitionByCode(code)
        if (comp) { nav(comp.status === 'closed' ? `/k/${comp.slug}/resultat` : `/k/${comp.slug}`, { replace: true }); return }
        const r = await quizJoin(code)
        if ('ok' in r) { nav(`/quiz/${r.code}`, { replace: true }); return }
        setMsg(r.error === 'not_found' ? 'Fant ingen konkurranse eller quiz med den koden.' : r.error === 'started' ? 'Quizen har allerede startet. Vent til neste.' : 'Kunne ikke bli med.')
      } catch (e) { setMsg(errorMessage(e)) }
    })()
  }, [code, nav])

  if (!msg) return <Loading text="Finner koden …" />
  return <div className="card"><h1>Kunne ikke bli med</h1><p role="alert">{msg}</p><Link className="btn" to="/">Til forsiden</Link></div>
}
