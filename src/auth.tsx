import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './api/client'
import { getProfile } from './api/data'
import type { Profile } from './api/types'

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) { setProfile(null); setLoading(false) }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const uid = session?.user.id
  const refreshProfile = useCallback(async () => {
    if (!uid) return
    try { setProfile(await getProfile(uid)) } catch { setProfile(null) }
    setLoading(false)
  }, [uid])
  useEffect(() => { void refreshProfile() }, [refreshProfile])

  const signOut = useCallback(async () => { await supabase.auth.signOut() }, [])
  const value = useMemo(() => ({ loading, session, profile, refreshProfile, signOut }), [loading, session, profile, refreshProfile, signOut])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth utenfor AuthProvider')
  return v
}
