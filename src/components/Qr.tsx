import { useEffect, useState } from 'react'

/** QR-kode tegnet lokalt (ingen eksterne kall). Lenker til `/kode/ABCD`, som fører til en konkurranse eller et quiz-rom. */
export function Qr({ code, path = '/kode/' }: { code: string; path?: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let alive = true
    import('qrcode').then((m) => m.toString(`${location.origin}${path}${code}`, { type: 'svg', margin: 2, width: 640, errorCorrectionLevel: 'L' }))
      .then((s) => { if (alive) setSvg(s) }).catch(() => undefined)
    return () => { alive = false }
  }, [code, path])
  return <div className="skjerm-qr" data-testid="skjerm-qr" role="img" aria-label={`QR-kode for å bli med med koden ${code}`} dangerouslySetInnerHTML={{ __html: svg }} />
}
