-- Små innstillinger for hele appen. Alle innloggede kan lese; bare admin kan endre.
create table if not exists public.konk_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.konk_settings enable row level security;
drop policy if exists settings_read on public.konk_settings;
create policy settings_read on public.konk_settings for select to authenticated using (true);
drop policy if exists settings_admin on public.konk_settings;
create policy settings_admin on public.konk_settings for all to authenticated
  using ((select konk_is_admin())) with check ((select konk_is_admin()));
revoke all on public.konk_settings from public, anon;
grant select on public.konk_settings to authenticated;
grant insert, update on public.konk_settings to authenticated;
insert into public.konk_settings (key, value) values ('quiz_on_home', 'true'::jsonb) on conflict (key) do nothing;
