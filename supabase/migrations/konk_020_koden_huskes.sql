-- Når du har brukt en riktig kode, husker kontoen det: konkurransen blir lesbar for deg selv om den er skjult fra forsiden.
create table if not exists public.konk_comp_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  competition_id uuid not null references public.konk_competitions(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, competition_id)
);
alter table public.konk_comp_members enable row level security;
drop policy if exists members_read_own on public.konk_comp_members;
create policy members_read_own on public.konk_comp_members for select using (user_id = (select auth.uid()));
revoke all on public.konk_comp_members from public, anon, authenticated;
grant select on public.konk_comp_members to authenticated;

create or replace function public.konk_is_member(p_competition uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from konk_comp_members where user_id = auth.uid() and competition_id = p_competition)
$$;
revoke all on function public.konk_is_member(uuid) from public, anon;
grant execute on function public.konk_is_member(uuid) to authenticated;

drop policy if exists competitions_read on public.konk_competitions;
create policy competitions_read on public.konk_competitions for select
  using (((visible and status <> 'draft'::text) or (status <> 'draft'::text and (select konk_is_member(id))) or (select konk_is_admin())));

-- Bli med med kode: finner konkurransen og husker det på kontoen. Utkast gis bare til admin.
drop function if exists public.konk_competition_by_code(text);
create or replace function public.konk_join_by_code(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r konk_competitions;
begin
  if auth.uid() is null then raise exception 'Logg inn.'; end if;
  select * into r from konk_competitions where code = upper(btrim(coalesce(p_code, '')));
  if not found then return null; end if;
  if r.status = 'draft' and not (select konk_is_admin()) then return null; end if;
  insert into konk_comp_members (user_id, competition_id) values (auth.uid(), r.id) on conflict do nothing;
  return jsonb_build_object('slug', r.slug, 'title', r.title, 'status', r.status);
end $$;
revoke all on function public.konk_join_by_code(text) from public, anon;
grant execute on function public.konk_join_by_code(text) to authenticated;
