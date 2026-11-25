# Konk – kontrakt mellom backend og frontend

Stack: React + Vite + TypeScript, supabase-js, hostes på Netlify.
Supabase-prosjekt (DELT med en annen app, ref `pthpjpxfbfvgoqkqxotj`): bruk KUN tabeller/funksjoner med prefikset `konk_`. Aldri rør `tlm_*`.
URL: https://pthpjpxfbfvgoqkqxotj.supabase.co  (anon key hentes med get_publishable_keys; legges i `.env` som VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, og i `.env.example` uten verdi).

## Eksisterende (migrasjon konk_001, ferdig)
konk_offices, konk_profiles(id,display_name,office_id,anonymous,is_admin,pin_hash), konk_competitions(id,slug,title,kind,status draft|open|closed),
konk_items(id,competition_id,position,label,image_path), konk_guess_options(id,competition_id,label),
konk_item_answers(item_id,correct_option_id), konk_entries(id,user_id,item_id,score 1-10,guess_option_id,comment,created_at,updated_at),
funksjon konk_is_admin(). RLS er på. Seed: kontor Oslo, Stavanger; konkurranse slug `julebrustest` (draft).

## Backend skal levere (konk_002 + edge functions)
### Tabeller/kolonner
- `konk_entries.hidden boolean default false` (moderering)
- `konk_login_attempts(id, ip text, created_at)` – rate limit (kun service role)
- `konk_feedback(id uuid, user_id, competition_id, item_id null, target text check in ('item','result'), emoji text null, comment text null (<=500), hidden bool default false, created_at)`, unique ikke nødvendig
- Admin-policies (konk_is_admin()) for ALL på competitions, items, guess_options, item_answers, offices; select/update på profiles (kun lese; ikke endre pin_hash fra klient), select+update på entries og feedback.
- Brukere: insert/select/delete egne feedback-rader (select kun egne direkte).
### Edge function `konk-auth` (verify_jwt=false), POST JSON
- `{action:"register", display_name, office_id, anonymous}` → 200 `{pin:"123456", session:{access_token,refresh_token,expires_in,expires_at,token_type,user}}`
- `{action:"login", display_name, pin}` → 200 `{session}`; 401 `{error:"invalid_pin"}` (feil navn ELLER pin, samme svar); 429 `{error:"too_many_attempts"}` (maks 5 feil/min per IP og per navn)
- `register` gir 409 `{error:"name_taken"}` hvis navnet (case-insensitivt) finnes. Navn er unikt og brukes som brukernavn. Pin er per bruker: pin_hash = HMAC(secret, "<user_id>:<pin>"), ikke globalt unik.
- Pin: 6 siffer, unik, lagres som HMAC-SHA256(pin, secret KONK_PIN_SECRET) hex i konk_profiles.pin_hash. Auth-bruker opprettes med admin API (email `<uuid>@konk.invalid`, passord = HMAC(secret, user_id), email_confirm true); login signerer inn server-side og returnerer session. CORS åpen (OPTIONS).
### Edge function `konk-admin` (verify_jwt=true; sjekk konk_is_admin for kallende bruker)
- `{action:"reset_pin", user_id}` → `{pin}` (ny pin vises kun her; gammel slutter å virke; eksisterende sessions kan beholdes)
### RPC (security definer, search_path satt, execute kun authenticated, revoke fra anon/public)
- `konk_get_answers(p_competition uuid)` → table(item_id, correct_option_id); tom med mindre status='closed' eller admin
- `konk_results(p_competition uuid) returns jsonb` kun når closed eller admin (ellers raise exception 'not_closed'):
  `{overall:{avg,n_entries,participants,hit_rate}, offices:[{office_id,name,avg_score,n_entries,participants,hit_rate}], items:[{item_id,position,label,avg_score,n,by_office:[{office_id,name,avg_score,n}],correct_option_id,correct_label,hit_rate}], comments:[{item_id,comment,display_name|null,office_name,score}]}`
  display_name er null når brukeren er anonym. Skjulte (hidden) kommentarer utelates. Anonyme brukere teller i alle snitt.
- `konk_get_feedback(p_competition uuid)` → table(id,item_id,target,emoji,comment,display_name|null,office_name,created_at) (ikke hidden; kun når closed eller admin)
- `konk_my_progress(p_competition uuid)` → int antall egne entries
### Test
Backend-agenten skal teste med execute_sql (opprett testdata, kjør, RYDD OPP igjen – slett alt testdata) og kjøre get_advisors for konk_*-funn. Lagre alle SQL-migrasjoner også som filer i `supabase/migrations/` og funksjonskode i `supabase/functions/<navn>/index.ts`.

## Frontend skal levere (i `/home/user/konk`, Vite-prosjekt i rot)
Mobil-først, juletema (CSS-variabler for palett: rød/grønn/gull, snø-animasjon som respekterer prefers-reduced-motion, WCAG AA-kontrast), norsk bokmål UI.
Ruter (react-router): `/` (hovedside: liste over konkurranser status<>draft, krever login), `/login` (kun pinkode-felt + «Ny bruker»), `/registrer` (navn, kontor fra konk_offices, anonym-bryter; viser pin ÉN gang med kopier-knapp og «jeg har lagret den»-bekreftelse), `/k/:slug` (julebrustest: stepper Glass 1..N, score 1–10, gjett fra liste, kommentar, autosave via upsert på (user_id,item_id), låst når ikke open, progress), `/k/:slug/resultat` (kun closed; kontor-split, totalt, rangering, fasit, treffprosent, kommentarer per brus, feedback/reaksjoner på brustype og resultat via konk_feedback + konk_get_feedback), `/profil` (bytt visningsnavn og anonym, logg ut), `/admin` (kun is_admin: opprett/rediger konkurranse og status, legg til glass med label/posisjon og fasit, gjetteliste, brukerliste med «reset pinkode» via konk-admin, moderering: skjul kommentarer/feedback).
Session: supabase-js med persistSession; etter register/login kall supabase.auth.setSession(session fra konk-auth).
Hosting: `netlify.toml` (build `npm run build`, publish `dist`, SPA-redirect `/* /index.html 200`). Tester: Vitest for ren logikk (f.eks. validering, score-formattering); `npm run build` og `npm run lint`/typecheck må passere.
Ikke commit/push – orkestrator gjør git. Ikke dupliser kontrakt; spør ved uklarhet ved å velge enkleste tolkning og skrive den i `docs/NOTES.md`.
