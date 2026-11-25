-- Valgfritt: vis brusnavn (fasit) på live tavlen. Standard av. Vises alltid når konkurransen er avsluttet.
alter table public.konk_competitions add column if not exists live_board_names boolean not null default false;
-- (konk_live_board(uuid) er oppdatert i Supabase til å returnere "brus" per glass og "names"; se git-historikk for kroppen)
