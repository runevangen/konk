import { useCallback, useEffect, useRef, useState } from 'react'
import { quizState, type QuizState } from '../../api/quiz'
import { remainingMs } from '../../lib/quiz'

/** Spør serveren om romtilstand jevnlig og gir en nedtelling som går jevnt mellom svarene. Klokka er alltid serverens. */
export function useQuizRoom(code: string, pollMs = 1000) {
  const [state, setState] = useState<QuizState | null>(null)
  const [error, setError] = useState<unknown>(null)
  const recvAt = useRef(0)
  const inflight = useRef(false)
  const lastKick = useRef(0)
  const [now, setNow] = useState(() => performance.now())

  const refresh = useCallback(async () => {
    if (inflight.current || !code) return
    inflight.current = true
    try {
      const s = await quizState(code)
      recvAt.current = performance.now()
      setState(s); setError(null)
    } catch (e) {
      setError(e)
    } finally {
      inflight.current = false
    }
  }, [code])

  useEffect(() => {
    setState(null); setError(null)
    void refresh()
    const t = setInterval(() => { if (!document.hidden) void refresh() }, pollMs)
    const vis = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [code, pollMs, refresh])

  const playing = state?.status === 'playing'
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setNow(performance.now()), 200)
    return () => clearInterval(t)
  }, [playing])

  const remaining = playing ? remainingMs(state?.left_ms, now - recvAt.current) : 0

  // Når tiden er ute: hent ny tilstand med en gang (men ikke oftere enn hvert 700. ms)
  useEffect(() => {
    if (playing && remaining === 0 && performance.now() - lastKick.current > 700) {
      lastKick.current = performance.now()
      void refresh()
    }
  }, [playing, remaining, refresh])

  return { state, error, refresh, remaining }
}
