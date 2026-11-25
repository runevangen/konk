-- Live tavle: gjennomsnittsscore underveis, per kontor og samlet. Ingen navn, kommentarer eller fasit.
-- Snitt skjules til minst k=2 svar (beskytter anonyme). Admin slår tavlen av/på per konkurranse (live_board).
alter table public.konk_competitions add column if not exists live_board boolean not null default false;
-- (funksjonen konk_live_board(uuid) er identisk med den som er kjørt i Supabase; se git-historikk for kroppen)
