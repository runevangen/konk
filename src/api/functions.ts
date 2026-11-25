import { ApiError, SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './client'
import type { AuthSession, RegisterInput } from './types'

async function call<T>(name: string, body: unknown, token?: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('network', 0, 'Får ikke kontakt med serveren')
  }
  let json: unknown = null
  try { json = await res.json() } catch { /* tom body */ }
  if (!res.ok) {
    const code = (json as { error?: string } | null)?.error ?? `http_${res.status}`
    throw new ApiError(code, res.status)
  }
  return json as T
}

/** konk-auth: register. Returnerer pin (vises kun én gang) og session. */
export function register(input: RegisterInput) {
  return call<{ pin: string; session: AuthSession }>('konk-auth', { action: 'register', ...input })
}

/** konk-auth: login med navn + pin. */
export function login(displayName: string, pin: string) {
  return call<{ session: AuthSession }>('konk-auth', { action: 'login', display_name: displayName, pin })
}

/** Gjør session fra konk-auth gjeldende i supabase-js (persisteres av klienten). */
export async function applySession(session: AuthSession) {
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (error) throw new ApiError('session', 0, error.message)
}

/** konk-auth: bytt egen pinkode (krever innlogget bruker og nåværende pinkode). */
export async function changePin(oldPin: string, newPin: string) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ApiError('not_signed_in', 401)
  return call<{ ok: true }>('konk-auth', { action: 'change_pin', old_pin: oldPin, new_pin: newPin }, token)
}

async function adminCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ApiError('not_signed_in', 401)
  return call<T>('konk-admin', body, token)
}

/** konk-admin: ny tilfeldig pinkode (vises kun én gang). */
export function adminResetPin(userId: string) {
  return adminCall<{ pin: string }>({ action: 'reset_pin', user_id: userId })
}
/** konk-admin: sett en bestemt pinkode (6 siffer, ikke svak). */
export function adminSetPin(userId: string, pin: string) {
  return adminCall<{ ok: true }>({ action: 'set_pin', user_id: userId, pin })
}
/** konk-admin: slett bruker. Profil, svar og tilbakemeldinger slettes også. */
export function adminDeleteUser(userId: string) {
  return adminCall<{ ok: true }>({ action: 'delete_user', user_id: userId })
}

export function errorMessage(e: unknown): string {
  const code = e instanceof ApiError ? e.code : ''
  switch (code) {
    case 'invalid_pin': return 'Feil navn eller pinkode. Prøv igjen.'
    case 'weak_pin': return 'Velg en kode som er vanskeligere å gjette. Ikke samme siffer (111111) eller rekke (123456).'
    case 'cannot_delete_self': return 'Du kan ikke slette din egen bruker.'
    case 'not_found': return 'Fant ikke brukeren (er den allerede slettet?).'
    case 'same_pin': return 'Den nye koden må være ulik den gamle.'
    case 'name_taken': return 'Navnet er allerede i bruk. Velg et annet, for eksempel med etternavn eller initial.'
    case 'too_many_attempts': return 'For mange forsøk. Vent ett minutt og prøv igjen.'
    case 'network': return 'Får ikke kontakt med serveren. Sjekk nettet.'
    case 'not_closed': return 'Resultatene er ikke klare ennå.'
    case 'http_403': return 'Du har ikke tilgang til dette.'
  }
  if (e instanceof Error && e.message) return e.message
  return 'Noe gikk galt. Prøv igjen.'
}
