import { useRef, type ReactNode } from 'react'

interface Del { id: string; tittel: string; innhold: ReactNode }

const DELER: Del[] = [
  {
    id: 'oversikt',
    tittel: 'Kort fortalt',
    innhold: (
      <>
        <p>Appen har to ting: <strong>konkurranser</strong> (for eksempel en julebrust- eller juleøltest der folk gir poeng og gjetter hva hvert glass er) og <strong>quiz</strong> (en sanntids party-quiz med romkode).</p>
        <ul>
          <li>Du styrer det meste fra <strong>Admin</strong> (toppraden) og fra <strong>«⚙️ Administrer»</strong> på forsiden.</li>
          <li>Alle deltakere logger inn med <strong>navn og PIN</strong> og velger kontor (Oslo eller Stavanger). PIN-en vises bare én gang når de lager bruker.</li>
          <li>Deltakere kommer inn i en konkurranse med en <strong>romkode på fire bokstaver</strong>. De ser ingen konkurranser før de har brukt koden.</li>
          <li>Du viser det på en stor skjerm med <strong>Storskjerm</strong>: live tavle mens det pågår, og en avsløring når det er over.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ny-konkurranse',
    tittel: 'Lage en konkurranse (steg for steg)',
    innhold: (
      <>
        <ol>
          <li><strong>Admin → Konkurranser → «+ Ny konkurranse».</strong> Skriv tittel, en <em>slug</em> (adressen, små bokstaver og bindestrek, for eksempel <code>juleol-2026</code>) og type (for eksempel «brus» eller «øl»).</li>
          <li><strong>Status:</strong> <em>Utkast</em> (ingen ser den) → <em>Åpen</em> (deltakerne kan svare) → <em>Avsluttet</em> (resultatene vises). Start som utkast mens du legger inn glass.</li>
          <li><strong>Live tavle</strong> på eller av. På: deltakerne ser snitt per glass underveis. Tips: slå den av hvis du ikke vil at tavlen skal påvirke stemmene.</li>
          <li><strong>«Vis navn på enhet på live tavlen»</strong> røper fasiten for dem som ikke er ferdige. Bruk den bare når alle har smakt ferdig.</li>
          <li><strong>Admin → Glass og fasit:</strong> velg konkurransen, og legg inn glassene (du kan lime inn en hel liste, én per linje). Sett <strong>fasit</strong> per glass, altså hva det egentlig er. «Skjul fasit» skjuler den på skjermen din mens du jobber foran andre.</li>
          <li><strong>Admin → Gjetteliste:</strong> valgene deltakerne gjetter blant. Legg gjerne inn noen ekstra alternativer som ikke er riktige.</li>
          <li><strong>Sett status til Åpen</strong> (Admin → Konkurranser → Rediger) når du er klar.</li>
        </ol>
        <p className="soft">Redigerer du en konkurranse, åpnes skjemaet rett der kortet står. Det er lurt å teste hele opplegget først (se «Før kvelden»).</p>
      </>
    ),
  },
  {
    id: 'kode',
    tittel: 'Romkode og tilgang',
    innhold: (
      <>
        <ul>
          <li>Hver konkurranse har en <strong>kode på fire bokstaver</strong>. Du finner den under <strong>Admin → Konkurranser</strong> på kortet («Kode PMEC»), og den står på <strong>storskjermen</strong> sammen med en QR-kode.</li>
          <li><strong>✏️ Endre kode</strong> lar deg velge en egen kode (for eksempel JULE). <strong>🎲 Tilfeldig</strong> lager en ny. Den gamle slutter å virke for nye som prøver, men de som alt har brukt den, beholder tilgangen.</li>
          <li>Deltakere skriver koden i <strong>«Har du en kode?»</strong> øverst på forsiden, eller skanner QR-koden. Er de ikke logget inn, tas de gjennom innlogging eller registrering og rett inn.</li>
          <li><strong>Kontoen husker koden</strong>: de trenger den ikke igjen, på noen enhet.</li>
          <li><strong>Alle konkurranser krever kode som standard.</strong> Vil du at en skal være åpen for alle innloggede, velg <strong>«👁 Åpen for alle»</strong> under «⚙️ Administrer» på forsiden. «🔑 Krever kode» setter den tilbake.</li>
          <li>Koden og QR-koden <strong>skjules på storskjermen etter 10 minutter</strong> så de ikke ligger fremme hele kvelden. Trykk «Vis koden i 10 min» for å vise dem igjen.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'forsiden',
    tittel: 'Administrere fra forsiden',
    innhold: (
      <>
        <p>Trykk <strong>«⚙️ Administrer»</strong> over konkurransene på forsiden. Da får hver konkurranse:</p>
        <ul>
          <li><strong>▲ ▼</strong> for å flytte den opp eller ned i listen (gjelder for alle).</li>
          <li><strong>📺 Storskjerm</strong>, som åpnes i en ny fane.</li>
          <li><strong>👁 Åpen for alle / 🔑 Krever kode.</strong> Den som krever kode, ser du selv dimmet med merket «Krever kode».</li>
          <li><strong>🗑 Slett</strong> (se advarselen nedenfor).</li>
        </ul>
        <p>Quiz-kortet har en egen bryter, <strong>«👁 Vises på forsiden / 🚫 Skjult»</strong>, hvis du vil skjule quizen for andre. Quiz virker fortsatt med kode når den er skjult.</p>
        <p className="soft"><strong>Advarsel:</strong> «Slett» fjerner glass, fasit, svar og kommentarer for alltid, og du må skrive SLETT for å bekrefte. Vil du bare gjemme den, bruk «Krever kode».</p>
      </>
    ),
  },
  {
    id: 'skjerm',
    tittel: 'Storskjermen for konkurranser',
    innhold: (
      <>
        <p>Åpne den med <strong>«📺 Storskjerm»</strong> på konkurransen (Admin → Konkurranser, eller «⚙️ Administrer» på forsiden). Bare admin kommer inn. Den er laget for 16:9 på en projektor eller TV.</p>
        <h3>Mens konkurransen er åpen</h3>
        <ul>
          <li>Live tavle: glass i rekkefølge etter snitt, QR-kode og romkode, og antall deltakere og svar per kontor.</li>
          <li><strong>Trykk på et glass</strong> for et panel med fordeling av score, snitt per kontor, hva folk gjettet, smak og kommentarer. Piltastene ← → bytter glass, Esc lukker.</li>
          <li>Gjetninger, fasit og kommentarer er <strong>låst</strong> mens smakingen pågår, så skjermen ikke røper noe. Trykk «Vis for alle» når du vil vise dem, og «Skjul igjen» for å låse dem.</li>
        </ul>
        <h3>Når konkurransen er avsluttet</h3>
        <ul>
          <li>Skjermen starter på «Nå avslører vi resultatet». Trykk <strong>Neste ▶</strong> (eller → / mellomrom) for å avsløre glassene <strong>fra siste til første plass</strong>, med fasit, snitt, kontorene, smak og dagens sitat. ◀ går tilbake.</li>
          <li>Har flere glass samme snitt, står det «Delt 2. plass» med hvem det deles med.</li>
          <li>Til slutt kommer en oppsummering: <strong>Rangering</strong> (eller «Topp 10» når det er flere enn ti glass), kontorene, beste gjettere og en rullende rekke med kommentarer. Trykk på en rad for detaljer.</li>
        </ul>
        <p className="soft">Kommentarer og dagens sitat vises først når konkurransen er avsluttet, med mindre du selv trykker «Vis for alle» i panelet.</p>
      </>
    ),
  },
  {
    id: 'moderering',
    tittel: 'Kommentarer, dagens sitat og svar',
    innhold: (
      <>
        <ul>
          <li><strong>Admin → Moderering:</strong> se alle kommentarer og tilbakemeldinger. <strong>Skjul</strong> en kommentar du ikke vil vise (den forsvinner fra resultater og storskjerm). «Vis» henter den tilbake.</li>
          <li><strong>☆ Løft frem</strong> gjør en kommentar til <strong>«Dagens sitat»</strong> for glasset. Bare ett per glass. Det vises stort på resultatsiden og på storskjermen. En skjult kommentar kan ikke være sitat.</li>
          <li>Anonyme deltakere vises som «Anonym» for alle andre. Du ser navnet i listene dine.</li>
          <li><strong>Admin → Svar:</strong> slett ett enkelt svar, alle svar fra én bruker, eller <strong>nullstill alt</strong> (krever at du skriver SLETT). Nullstilling kan ikke angres.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'brukere',
    tittel: 'Brukere og PIN',
    innhold: (
      <>
        <ul>
          <li><strong>Admin → Brukere:</strong> se alle, søk, og velg en bruker.</li>
          <li><strong>Glemt PIN?</strong> Trykk «Ny tilfeldig» eller sett en egen PIN (seks sifre, ikke noe enkelt som 123456). Gi den nye PIN-en til brukeren; den vises bare én gang.</li>
          <li><strong>Slett</strong> fjerner brukeren og alle svarene hens.</li>
          <li>Brukerne kan selv bytte PIN, navn og anonymitet under <strong>Profil</strong>.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'resultater',
    tittel: 'Etter avslutning: hva deltakerne ser',
    innhold: (
      <>
        <ul>
          <li><strong>Resultat</strong> for hele gruppen: totalt, kontorene og alle glass med fasit.</li>
          <li><strong>«🎯 Hva gjettet jeg?»</strong> (Mine svar): hvor mange de gjettet riktig, fasit og ✓/✗ per glass, og hvor de ligger mot beste, snittet og dårligste. Sammenligningen vises først når minst tre har deltatt.</li>
          <li>Du som admin kan se resultatene også før du avslutter (på resultatsiden og på storskjermen).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'quiz-sporsmal',
    tittel: 'Quiz: spørsmål og temaer',
    innhold: (
      <>
        <ul>
          <li><strong>Admin → Quiz-spørsmål.</strong> Øverst ser du temaene med antall spørsmål. Trykk på et tema for å filtrere.</li>
          <li><strong>«＋ Nytt tema»:</strong> skriv et navn (1–40 tegn, ikke et som finnes) og legg inn det første spørsmålet. Temaet lagres når spørsmålet lagres.</li>
          <li><strong>«+ Nytt spørsmål»:</strong> spørsmål, fire alternativer, hvilket som er riktig, og en forklaring som vises etter spørsmålet.</li>
          <li><strong>Importer:</strong> lim inn JSON eller CSV (eller velg en fil). Felter: <code>spoersmaal</code>, <code>alternativer</code> (A–D), <code>riktig</code> (A–D), og valgfritt <code>kategori</code>, <code>vanskelighet</code>, <code>forklaring</code>, <code>kilde</code>, <code>kilde_nivaa</code>, <code>status</code> (OK/Usikker) og <code>merknad</code>. Du får en forhåndsvisning med feil og dubletter før noe lagres. Spørsmål merket «Usikker» kan skjules automatisk.</li>
          <li><strong>Skjul</strong> et spørsmål hvis det ikke skal brukes. <strong>Eksporter JSON</strong> gir deg en kopi av listen.</li>
          <li>Hold <strong>spørsmål og fasit utenfor den åpne koden</strong>: de ligger i databasen, ikke i repoet.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'quiz-kjoring',
    tittel: 'Quiz: kjøre en runde',
    innhold: (
      <>
        <ol>
          <li><strong>Forsiden → Quiz → «Lag quiz-rom».</strong> Velg tema, antall spørsmål (opptil 20, og ikke flere enn temaet har), tid per spørsmål og tid for fasit. «Jeg spiller selv» er på som standard. Slå den av hvis du bare skal styre.</li>
          <li>Du får en <strong>romkode</strong> og kommer til rommet. Trykk <strong>«Åpne storskjerm»</strong> for QR-kode, kode og spillerliste på en stor skjerm.</li>
          <li>Spillerne trykker «Bli med i quiz» eller skanner QR-koden (og logger inn om nødvendig). Opptil <strong>100 spillere</strong> per rom, og du kan ha <strong>3 aktive rom</strong>.</li>
          <li>Når minst to er med: <strong>«Start quizen».</strong> En 10 sekunders nedtelling (gavepakken) går først. «Hopp over nedtellingen» hopper over den.</li>
          <li>Hvert spørsmål har en tidslinje. Fasit, forklaring og stilling kommer når alle har svart eller tiden går ut. Poeng er 100 pluss opptil 80 for fart og 7 per riktig på rad (maks 3 rader).</li>
          <li>Du kan <strong>«Vis fasit nå»</strong> eller <strong>«Hopp til neste»</strong> for å gå raskere, og <strong>«Avslutt og slett rommet»</strong> når du er ferdig.</li>
          <li>Storskjermen viser stillingen med topp 10 og kontorene mot hverandre <strong>etter hvert spørsmål</strong>, og en vinner-oppsummering til slutt.</li>
        </ol>
        <p className="soft">Rom slettes av seg selv etter seks timer. Det finnes et testtema («test») med fem enkle spørsmål du kan bruke til å prøve hele opplegget.</p>
      </>
    ),
  },
  {
    id: 'for-kvelden',
    tittel: 'Før kvelden: sjekkliste',
    innhold: (
      <>
        <ul className="sjekkliste">
          <li>☐ <strong>Be alle registrere seg i forveien</strong> (navn, kontor, og lagre PIN-en med et skjermbilde). Registrering og innlogging går via Supabase, som har en grense for hvor mange som kan logge inn per minutt. Er mange på samme nett samtidig, kan noen få feil. Be dem ellers prøve igjen om litt eller bruke mobildata.</li>
          <li>☐ <strong>Sjekk grensene i Supabase</strong> (Authentication → Rate Limits): «sign-ups og sign-ins» bør stå høyt nok (for eksempel 500 per 5 minutter), og kan senkes igjen etterpå.</li>
          <li>☐ <strong>Prøv hele opplegget</strong> med to telefoner og storskjermen oppe.</li>
          <li>☐ <strong>Legg inn glass og fasit</strong>, og sjekk gjetteliste og at status er <em>Åpen</em>.</li>
          <li>☐ <strong>Del koden</strong> (Admin → Konkurranser eller storskjermen) med deltakerne, og husk at den skjules på skjermen etter 10 minutter.</li>
          <li>☐ <strong>Åpne storskjermen i god tid</strong> og sjekk at den passer på skjermen din.</li>
          <li>☐ <strong>Underveis:</strong> følg live tavlen. Er navn på enhet av, røper den ingenting.</li>
          <li>☐ <strong>Når alle er ferdige:</strong> sett status til <em>Avsluttet</em>, løft frem et sitat per glass under Moderering, og åpne storskjermen for avsløringen.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'feil',
    tittel: 'Når noe ikke virker',
    innhold: (
      <>
        <ul>
          <li><strong>«Jeg ser ingen konkurranser»:</strong> de må skrive inn koden i «Har du en kode?» på forsiden.</li>
          <li><strong>«Fant ikke konkurransen»:</strong> de har ikke brukt koden, eller konkurransen er et utkast.</li>
          <li><strong>QR-koden virker ikke:</strong> be dem skrive koden selv. Er den skjult på skjermen, trykk «Vis koden i 10 min».</li>
          <li><strong>Glemt PIN:</strong> Admin → Brukere → «Ny tilfeldig».</li>
          <li><strong>Live tavlen er tom:</strong> den fylles ut etter hvert som folk gir poeng. Snitt vises når minst to har svart. Er live tavle slått av, står det en melding på skjermen.</li>
          <li><strong>Storskjermen viser ikke gjetninger eller kommentarer:</strong> de er låst mens konkurransen er åpen. Trykk «Vis for alle», eller avslutt konkurransen.</li>
          <li><strong>En deltaker svarte feil:</strong> hen kan selv endre svarene sine under «Mine svar» så lenge konkurransen er åpen. Du kan også slette svar under Admin → Svar.</li>
          <li><strong>Quiz-rommet står fast:</strong> «Hopp til neste» eller «Avslutt og slett rommet», og lag et nytt.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'personvern',
    tittel: 'Personvern og sikkerhet',
    innhold: (
      <>
        <ul>
          <li>Ingen sporing, ingen informasjonskapsler for statistikk, og ingen e-postadresse samles inn. Brukerne har bare navn, kontor og en PIN (lagret kryptert).</li>
          <li>Anonyme deltakere vises som «Anonym». Snitt og sammenligninger vises først når nok har deltatt, så ingen enkeltperson kan kjennes igjen.</li>
          <li>Bare admin kan se andres svar, endre fasit, skjule kommentarer og åpne storskjermen.</li>
          <li>Del aldri PIN-er i et åpent forum. Og ikke del koden bredere enn nødvendig.</li>
        </ul>
      </>
    ),
  },
]

/** Bruksanvisning for admin. Hver del kan åpnes og lukkes; «Åpne alle» viser alt (for eksempel til utskrift). */
export function AdminHjelp() {
  const ref = useRef<HTMLDivElement>(null)
  const alle = (open: boolean) => ref.current?.querySelectorAll('details').forEach((d) => { d.open = open })
  return (
    <div ref={ref} data-testid="admin-hjelp">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Bruksanvisning for admin</h2>
        <p className="soft" style={{ marginBottom: 10 }}>Slik lager og kjører du en konkurranse eller quiz, steg for steg. Trykk på en overskrift for å åpne den.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn ghost small" onClick={() => alle(true)} data-testid="hjelp-apne-alle">Åpne alle</button>
          <button type="button" className="btn ghost small" onClick={() => alle(false)}>Lukk alle</button>
          <button type="button" className="btn ghost small" onClick={() => window.print()}>Skriv ut</button>
        </div>
        <ol className="hjelp-innhold" aria-label="Innhold">
          {DELER.map((d) => <li key={d.id}><a href={`#hjelp-${d.id}`} onClick={(e) => { e.preventDefault(); const el = document.getElementById(`hjelp-${d.id}`) as HTMLDetailsElement | null; if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }}>{d.tittel}</a></li>)}
        </ol>
      </div>
      {DELER.map((d, i) => (
        <details key={d.id} id={`hjelp-${d.id}`} className="card hjelp-del" open={i === 0}>
          <summary><strong>{d.tittel}</strong></summary>
          <div className="hjelp-tekst">{d.innhold}</div>
        </details>
      ))}
    </div>
  )
}
