# Frontend-notater (Konk)

## Kjøring
- `npm run dev` / `npm run build` / `npm run typecheck` (= `npm run lint`, ren tsc) / `npm test` (Vitest).
- `.env` (ikke i git) har VITE_SUPABASE_URL og anon-nøkkel (legacy JWT `anon`); `.env.example` har tomme nøkler.
- UI-test: `npm run build && npx vite preview --port 4173 &` deretter `NODE_PATH=<global node_modules> node e2e/run.cjs`. Testen mocker hele Supabase-nettverket via Playwright `route`, tar mobilskjermbilder (390x844) til `docs/screenshots/`.
- API-kontrakten er samlet i `src/api/` (`functions.ts` = konk-auth/konk-admin, `data.ts` = tabeller og RPC, `types.ts`).

## Antakelser
- Anon-nøkkel: legacy JWT-anon brukes (fungerer både med supabase-js og som Bearer mot edge functions); publishable-nøkkelen kan byttes inn i `.env`.
- `konk_entries.score` antas NOT NULL: score, gjetning og kommentar lagres derfor først når score er valgt (UI sier «Velg en score for å lagre»). Upsert bruker `onConflict: 'user_id,item_id'` og krever unik constraint på (user_id,item_id).
- Autosave: score/gjetning lagres umiddelbart, kommentar 700 ms etter siste tastetrykk, samt flush ved Neste/Forrige, bytte av glass, blur, og når fanen skjules. Lagringer serialiseres.
- «Gjett fra liste» har et ekstra valg «Vet ikke» (guess_option_id = null).
- `hit_rate` tolkes som andel 0..1 (verdier >1 tolkes som prosent). `avg`/`avg_score` på skala 1–10, vist med komma og 1 desimal.
- Resultatside: rangering = glass sortert etter avg_score (like snitt deler plass); kontor rangert etter avg_score. Kommentarene fra `konk_results` vises per glass; reaksjoner (😋 👍 😬 🤢 🎄) togles ved å inserte/slette egen `konk_feedback`-rad (emoji uten kommentar). Fritekst-feedback finnes kun på «resultat» (target='result'); på glass kun reaksjoner (men kommentarer med target='item' vises hvis de finnes).
- Admin kan se resultatside også for ikke-avsluttede konkurranser (RPC tillater admin).
- Resultatsiden er bare tilgjengelig for `closed` (admin unntatt). Forsiden lenker closed -> resultat, open -> stepper. Draft-konkurranser skjules på forsiden (`status<>draft`); admin ser alle under /admin.
- `konk_competitions.kind` er fritekst i admin (standard `brus`) siden lovlige verdier ikke står i kontrakten.
- Profil: oppdaterer kun `display_name` og `anonymous` i `konk_profiles` (krever at egen-rad-update er tillatt av RLS fra konk_001; pin_hash røres aldri).
- Admin-moderering: skjuler/viser via `hidden` på `konk_entries` og `konk_feedback` (admin select+update iht. kontrakt). Brukerliste leser `konk_profiles` (admin select).
- Admin «Glass og fasit»: fasit lagres i `konk_item_answers` (upsert på item_id; tom = slett). Slett glass forutsetter cascade/delete-policy.
- Pinkode: holdes kun i React-state på /registrer (ikke storage/URL/router-state), nav skjules mens den vises, `beforeunload`-advarsel, og fjernes ved «Fortsett» (krever avkrysning «Jeg har lagret pinkoden»). Samme én-gangs-visning for admin-reset (lukk-knapp fjerner den). Session settes via `supabase.auth.setSession` samtidig, så brukeren er innlogget uansett.
- Feilkoder fra konk-auth mappes: 401 `invalid_pin`, 429 `too_many_attempts`; RPC-feil `not_closed` -> «ikke klare ennå».

## Tema / tilgjengelighet
- Palett som CSS-variabler i `src/styles.css`; `src/lib/theme.test.ts` verifiserer WCAG AA (4.5:1 tekst, 3:1 fokus/kanter) for alle brukte tekst/bakgrunn-par.
- Snø er dekorativ (`aria-hidden`), bak innholdet, og skjules helt ved `prefers-reduced-motion: reduce`.
- Tydelig fokusring (blå + hvit glorie) fungerer på både mørk og lys bakgrunn; trykkflater >= 44–48 px; score/gjett er radiogrupper (tastatur og skjermleser).

## Åpne punkter
- Ikke testet mot ekte backend (konk_002/edge functions var ikke klare); kun mocket nettverk. Bør røyktestes ende-til-ende: register -> setSession -> upsert entries -> close -> results.
- Verifiser at RLS tillater: egne `konk_entries` upsert, egen `konk_profiles` update, `konk_feedback` insert/delete for bruker.
- Bilder (`image_path`) vises ikke; ikke krevd i kontrakten.
- Bundle ~520 kB (150 kB gzip); kunne code-splittes (Admin) ved behov.
- Ingen ESLint; `lint` = typecheck.
