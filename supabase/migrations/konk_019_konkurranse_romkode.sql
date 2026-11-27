-- Kort romkode (4 bokstaver) for konkurranser, så folk kan bli med fra en QR-kode eller ved å skrive koden.
create or replace function public.konk_new_comp_code() returns text
language plpgsql volatile set search_path = public as $$
declare c text; i int; alfabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  loop
    c := '';
    for i in 1..4 loop c := c || substr(alfabet, 1 + floor(random() * 24)::int, 1); end loop;
    exit when not exists (select 1 from konk_competitions where code = c)
          and not exists (select 1 from konk_quiz_rooms where code = c);
  end loop;
  return c;
end $$;

alter table public.konk_competitions add column if not exists code text;
update public.konk_competitions set code = public.konk_new_comp_code() where code is null;
alter table public.konk_competitions
  alter column code set not null,
  alter column code set default public.konk_new_comp_code();
alter table public.konk_competitions drop constraint if exists konk_competitions_code_ok;
alter table public.konk_competitions add constraint konk_competitions_code_ok check (code ~ '^[A-Z]{4}$');
create unique index if not exists konk_competitions_code_key on public.konk_competitions (code);

-- Slå opp en konkurranse på koden. Skjulte og utkast gis bare til admin.
create or replace function public.konk_competition_by_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r konk_competitions;
begin
  if auth.uid() is null then raise exception 'Logg inn.'; end if;
  select * into r from konk_competitions where code = upper(btrim(coalesce(p_code, '')));
  if not found then return null; end if;
  if not ((r.visible and r.status <> 'draft') or (select konk_is_admin())) then return null; end if;
  return jsonb_build_object('slug', r.slug, 'title', r.title, 'status', r.status);
end $$;
revoke all on function public.konk_competition_by_code(text) from public, anon;
grant execute on function public.konk_competition_by_code(text) to authenticated;

-- Ny kode (admin), hvis den har kommet på avveie.
create or replace function public.konk_regen_comp_code(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not (select konk_is_admin()) then raise exception 'Bare admin.'; end if;
  c := konk_new_comp_code();
  update konk_competitions set code = c where id = p_id;
  if not found then raise exception 'Fant ikke konkurransen.'; end if;
  return c;
end $$;
revoke all on function public.konk_regen_comp_code(uuid) from public, anon;
grant execute on function public.konk_regen_comp_code(uuid) to authenticated;
