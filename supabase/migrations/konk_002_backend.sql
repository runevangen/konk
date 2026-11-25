-- konk_002: moderering, rate limit, feedback, admin-policies, RPC. Kun konk_*-objekter.

alter table public.konk_entries add column if not exists hidden boolean not null default false;

create unique index if not exists konk_profiles_pin_hash_key on public.konk_profiles (pin_hash) where pin_hash is not null;

-- Rate limit (kun service role)
create table if not exists public.konk_login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists konk_login_attempts_ip_created_idx on public.konk_login_attempts (ip, created_at desc);
alter table public.konk_login_attempts enable row level security;
revoke all on public.konk_login_attempts from anon, authenticated, public;

-- Feedback
create table if not exists public.konk_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.konk_profiles(id) on delete cascade,
  competition_id uuid not null references public.konk_competitions(id) on delete cascade,
  item_id uuid references public.konk_items(id) on delete cascade,
  target text not null check (target in ('item','result')),
  emoji text,
  comment text check (comment is null or char_length(comment) <= 500),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists konk_feedback_user_idx on public.konk_feedback (user_id);
create index if not exists konk_feedback_competition_idx on public.konk_feedback (competition_id);
create index if not exists konk_feedback_item_idx on public.konk_feedback (item_id);
create index if not exists konk_entries_item_idx on public.konk_entries (item_id);
create index if not exists konk_entries_guess_idx on public.konk_entries (guess_option_id);
alter table public.konk_feedback enable row level security;

-- Kolonnetilgang: pin_hash og is_admin skal ikke kunne leses/endres fra klient
revoke select, update on public.konk_profiles from authenticated;
grant select (id, display_name, office_id, anonymous, is_admin, created_at) on public.konk_profiles to authenticated;
grant update (display_name, office_id, anonymous) on public.konk_profiles to authenticated;
revoke all on public.konk_profiles from anon;

-- Ikke-admin kan ikke sette/endre hidden
create or replace function public.konk_guard_hidden() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.hidden and not coalesce(public.konk_is_admin(), false) then new.hidden := false; end if;
  elsif new.hidden is distinct from old.hidden and not coalesce(public.konk_is_admin(), false) then
    new.hidden := old.hidden;
  end if;
  return new;
end $$;
revoke execute on function public.konk_guard_hidden() from public, anon, authenticated;

drop trigger if exists konk_entries_guard_hidden on public.konk_entries;
create trigger konk_entries_guard_hidden before insert or update on public.konk_entries
  for each row execute function public.konk_guard_hidden();
drop trigger if exists konk_feedback_guard_hidden on public.konk_feedback;
create trigger konk_feedback_guard_hidden before insert or update on public.konk_feedback
  for each row execute function public.konk_guard_hidden();

-- Admin-policies
create policy admin_all on public.konk_competitions for all to authenticated
  using ((select public.konk_is_admin())) with check ((select public.konk_is_admin()));
create policy admin_all on public.konk_items for all to authenticated
  using ((select public.konk_is_admin())) with check ((select public.konk_is_admin()));
create policy admin_all on public.konk_guess_options for all to authenticated
  using ((select public.konk_is_admin())) with check ((select public.konk_is_admin()));
create policy admin_all on public.konk_item_answers for all to authenticated
  using ((select public.konk_is_admin())) with check ((select public.konk_is_admin()));
create policy admin_all on public.konk_offices for all to authenticated
  using ((select public.konk_is_admin())) with check ((select public.konk_is_admin()));
create policy admin_select on public.konk_profiles for select to authenticated
  using ((select public.konk_is_admin()));
create policy admin_select on public.konk_entries for select to authenticated
  using ((select public.konk_is_admin()));
create policy admin_update on public.konk_entries for update to authenticated
  using ((select public.konk_is_admin())) with check ((select public.konk_is_admin()));
create policy admin_select on public.konk_feedback for select to authenticated
  using ((select public.konk_is_admin()));
create policy admin_update on public.konk_feedback for update to authenticated
  using ((select public.konk_is_admin())) with check ((select public.konk_is_admin()));

-- Feedback: egne rader
create policy feedback_select_own on public.konk_feedback for select to authenticated
  using (user_id = (select auth.uid()));
create policy feedback_insert_own on public.konk_feedback for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy feedback_delete_own on public.konk_feedback for delete to authenticated
  using (user_id = (select auth.uid()));
revoke update on public.konk_feedback from authenticated;
grant update (hidden) on public.konk_feedback to authenticated; -- gated av admin_update-policy + trigger
revoke all on public.konk_feedback from anon;
revoke update on public.konk_entries from authenticated;
grant update (score, guess_option_id, comment, updated_at, hidden) on public.konk_entries to authenticated;
revoke all on public.konk_entries from anon;

-- RPC
create or replace function public.konk_my_progress(p_competition uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from konk_entries e join konk_items i on i.id = e.item_id
  where i.competition_id = p_competition and e.user_id = (select auth.uid())
$$;

create or replace function public.konk_get_answers(p_competition uuid)
returns table(item_id uuid, correct_option_id uuid)
language sql stable security definer set search_path = public as $$
  select a.item_id, a.correct_option_id
  from konk_item_answers a
  join konk_items i on i.id = a.item_id
  join konk_competitions c on c.id = i.competition_id
  where c.id = p_competition and (c.status = 'closed' or konk_is_admin())
$$;

create or replace function public.konk_get_feedback(p_competition uuid)
returns table(id uuid, item_id uuid, target text, emoji text, comment text, display_name text, office_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id, f.item_id, f.target, f.emoji, f.comment,
         case when p.anonymous then null else p.display_name end,
         o.name, f.created_at
  from konk_feedback f
  join konk_competitions c on c.id = f.competition_id
  join konk_profiles p on p.id = f.user_id
  join konk_offices o on o.id = p.office_id
  where f.competition_id = p_competition and not f.hidden
    and (c.status = 'closed' or konk_is_admin())
  order by f.created_at
$$;

create or replace function public.konk_results(p_competition uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_status text; res jsonb;
begin
  select status into v_status from konk_competitions where id = p_competition;
  if v_status is null or (v_status <> 'closed' and not konk_is_admin()) then
    raise exception 'not_closed';
  end if;
  with base as (
    select e.id as entry_id, e.user_id, e.item_id, e.score, e.comment, e.hidden,
           p.office_id, p.display_name, p.anonymous,
           (e.guess_option_id is not null and a.correct_option_id is not null) as guessed,
           (e.guess_option_id = a.correct_option_id) as hit
    from konk_entries e
    join konk_items i on i.id = e.item_id and i.competition_id = p_competition
    join konk_profiles p on p.id = e.user_id
    left join konk_item_answers a on a.item_id = e.item_id
  )
  select jsonb_build_object(
    'overall', (select jsonb_build_object(
        'avg', round(avg(score)::numeric, 2), 'n_entries', count(*),
        'participants', count(distinct user_id),
        'hit_rate', round((count(*) filter (where hit))::numeric / nullif(count(*) filter (where guessed), 0), 3)) from base),
    'offices', coalesce((select jsonb_agg(jsonb_build_object(
        'office_id', o.id, 'name', o.name,
        'avg_score', round(avg(b.score)::numeric, 2), 'n_entries', count(b.entry_id),
        'participants', count(distinct b.user_id),
        'hit_rate', round((count(*) filter (where b.hit))::numeric / nullif(count(*) filter (where b.guessed), 0), 3)) order by o.id)
        from konk_offices o left join base b on b.office_id = o.id group by o.id, o.name), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'position', i.position, 'label', i.label,
        'avg_score', round(avg(b.score)::numeric, 2), 'n', count(b.entry_id),
        'by_office', (select coalesce(jsonb_agg(jsonb_build_object('office_id', o.id, 'name', o.name,
              'avg_score', round(avg(b2.score)::numeric, 2), 'n', count(b2.entry_id)) order by o.id), '[]'::jsonb)
              from konk_offices o left join base b2 on b2.office_id = o.id and b2.item_id = i.id),
        'correct_option_id', a.correct_option_id, 'correct_label', go.label,
        'hit_rate', round((count(*) filter (where b.hit))::numeric / nullif(count(*) filter (where b.guessed), 0), 3)) order by i.position)
        from konk_items i
        left join base b on b.item_id = i.id
        left join konk_item_answers a on a.item_id = i.id
        left join konk_guess_options go on go.id = a.correct_option_id
        where i.competition_id = p_competition
        group by i.id, i.position, i.label, a.correct_option_id, go.label), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
        'item_id', b.item_id, 'comment', b.comment,
        'display_name', case when b.anonymous then null else b.display_name end,
        'office_name', o.name, 'score', b.score) order by i.position, b.entry_id)
        from base b join konk_items i on i.id = b.item_id join konk_offices o on o.id = b.office_id
        where not b.hidden and b.comment is not null and btrim(b.comment) <> ''), '[]'::jsonb)
  ) into res;
  return res;
end $$;

revoke execute on function public.konk_my_progress(uuid), public.konk_get_answers(uuid),
  public.konk_get_feedback(uuid), public.konk_results(uuid) from public, anon;
grant execute on function public.konk_my_progress(uuid), public.konk_get_answers(uuid),
  public.konk_get_feedback(uuid), public.konk_results(uuid) to authenticated;
