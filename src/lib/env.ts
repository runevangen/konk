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
