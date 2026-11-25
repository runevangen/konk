/** Fjerner mellomrom, linjeskift, usynlige/ikke-ASCII-tegn og omsluttende anførselstegn fra en miljøvariabel.
 *  Fanger vanlig copy/paste-feil i f.eks. Netlify. */
export function cleanEnv(raw: string | undefined | null): string {
  return (raw ?? '')
    .replace(/[^\x21-\x7E]/g, '')
    .replace(/^["'`]+|["'`]+$/g, '')
}

export function cleanUrl(raw: string | undefined | null): string {
  return cleanEnv(raw).replace(/\/+$/, '')
}

const URL_RE = /^https:\/\/[a-z0-9]{10,30}\.supabase\.co$/
const KEY_RE = /^(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_publishable_[A-Za-z0-9_-]+)$/

/** Leser `ref` og `role` fra en JWT-nøkkel uten å validere signaturen (kun for å fange feil nøkkel/prosjekt). */
export function jwtClaims(key: string): { ref?: string; role?: string } | null {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = typeof atob === 'function' ? atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)) : ''
    const c = JSON.parse(json) as { ref?: string; role?: string }
    return { ref: c.ref, role: c.role }
  } catch {
    return null
  }
}

/** Bruker renset miljøverdi bare hvis den ser gyldig ut, ellers reserveverdien.
 *  URL og anon/publishable-nøkkel er offentlige (ligger uansett i nettleseren), så reserve i koden er trygt.
 *  Gjør at appen virker selv om variablene i hosting er feil limt inn eller mangler. */
export function resolveSupabaseConfig(
  env: { url?: string | null; key?: string | null },
  fallback: { url: string; key: string },
): { url: string; key: string; usedFallback: { url: boolean; key: boolean } } {
  const url = cleanUrl(env.url)
  const key = cleanEnv(env.key)
  const urlOk = URL_RE.test(url)
  let keyOk = KEY_RE.test(key)
  const chosenUrl = urlOk ? url : fallback.url
  if (keyOk && key.startsWith('eyJ')) {
    // JWT-nøkkel må være en anon-nøkkel for samme prosjekt som URL-en (fanger kuttet/feil nøkkel)
    const c = jwtClaims(key)
    const ref = chosenUrl.replace(/^https:\/\//, '').split('.')[0]
    keyOk = !!c && c.role === 'anon' && c.ref === ref
  }
  return {
    url: chosenUrl,
    key: keyOk ? key : fallback.key,
    usedFallback: { url: !urlOk, key: !keyOk },
  }
}
