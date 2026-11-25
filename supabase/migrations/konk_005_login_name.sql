-- Innlogging med navn + pinkode. Pinkoden er nå knyttet til brukeren (HMAC(user_id:pin)),
-- så den trenger ikke være globalt unik. Navnet (case-insensitivt) må være unikt.
drop index if exists public.konk_profiles_pin_hash_key;

alter table public.konk_profiles
  add column if not exists name_key text generated always as (lower(btrim(display_name))) stored;
create unique index if not exists konk_profiles_name_key_idx on public.konk_profiles (name_key);

alter table public.konk_login_attempts add column if not exists login_name text;
create index if not exists konk_login_attempts_name_created_idx on public.konk_login_attempts (login_name, created_at desc);
