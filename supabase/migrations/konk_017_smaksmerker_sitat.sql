-- Smaksmerker (hurtigvalg i stedet for fritekst) og «dagens sitat» (admin løfter frem én kommentar per glass).
alter table public.konk_entries
  add column if not exists tags text[] not null default '{}',
  add column if not exists featured boolean not null default false;

alter table public.konk_entries drop constraint if exists konk_entries_tags_ok;
alter table public.konk_entries add constraint konk_entries_tags_ok
  check (tags <@ array['Søt','Krydret','Bitter','Fruktig','Maltig','Sur','Lett','Kraftig']::text[] and cardinality(tags) <= 8);

-- Bare admin kan sette «featured». Vanlige brukere kan ikke gi seg selv sitatplassen via API-et.
create or replace function public.konk_entries_guard_featured() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not (select konk_is_admin()) then
    if tg_op = 'INSERT' then new.featured := false; else new.featured := old.featured; end if;
  end if;
  return new;
end $$;
drop trigger if exists konk_entries_guard_featured on public.konk_entries;
create trigger konk_entries_guard_featured before insert or update on public.konk_entries
  for each row execute function public.konk_entries_guard_featured();

create or replace function public.konk_results(p_competition uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_status text; res jsonb;
begin
  select status into v_status from konk_competitions where id = p_competition;
  if v_status is null or (v_status <> 'closed' and not konk_is_admin()) then
    raise exception 'not_closed';
  end if;
  with base as (
    select e.id as entry_id, e.user_id, e.item_id, e.score, e.comment, e.hidden, e.tags, e.featured,
           p.office_id, p.display_name, p.anonymous,
           (e.guess_option_id is not null and a.correct_option_id is not null) as guessed,
           (e.guess_option_id = a.correct_option_id) as hit
    from konk_entries e
    join konk_items i on i.id = e.item_id and i.competition_id = p_competition
    join konk_profiles p on p.id = e.user_id
    left join konk_item_answers a on a.item_id = e.item_id
  ),
  office_rows as (
    select o.id as office_id, o.name,
           round(avg(b.score)::numeric, 2) as avg_score,
           count(b.entry_id) as n_entries,
           count(distinct b.user_id) as participants,
           round((count(*) filter (where b.hit))::numeric / nullif(count(*) filter (where b.guessed), 0), 3) as hit_rate
    from konk_offices o left join base b on b.office_id = o.id
    group by o.id, o.name
  ),
  item_rows as (
    select i.id as item_id, i.position, i.label,
           round(avg(b.score)::numeric, 2) as avg_score,
           count(b.entry_id) as n,
           (select coalesce(jsonb_agg(jsonb_build_object('office_id', o.id, 'name', o.name,
                    'avg_score', x.avg_score, 'n', x.n) order by o.id), '[]'::jsonb)
              from konk_offices o
              left join lateral (select round(avg(b2.score)::numeric, 2) as avg_score, count(b2.entry_id) as n
                                 from base b2 where b2.office_id = o.id and b2.item_id = i.id) x on true) as by_office,
           (select coalesce(jsonb_object_agg(z.t, z.c), '{}'::jsonb)
              from (select t, count(*) as c from base b3, unnest(b3.tags) t where b3.item_id = i.id group by t) z) as tags,
           a.correct_option_id, go.label as correct_label,
           round((count(*) filter (where b.hit))::numeric / nullif(count(*) filter (where b.guessed), 0), 3) as hit_rate
    from konk_items i
    left join base b on b.item_id = i.id
    left join konk_item_answers a on a.item_id = i.id
    left join konk_guess_options go on go.id = a.correct_option_id
    where i.competition_id = p_competition
    group by i.id, i.position, i.label, a.correct_option_id, go.label
  )
  select jsonb_build_object(
    'overall', (select jsonb_build_object(
        'avg', round(avg(score)::numeric, 2), 'n_entries', count(*),
        'participants', count(distinct user_id),
        'hit_rate', round((count(*) filter (where hit))::numeric / nullif(count(*) filter (where guessed), 0), 3)) from base),
    'offices', coalesce((select jsonb_agg(to_jsonb(r) order by r.office_id) from office_rows r), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(r) order by r.position) from item_rows r), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
        'item_id', b.item_id, 'comment', b.comment, 'featured', b.featured,
        'display_name', case when b.anonymous then null else b.display_name end,
        'office_name', o.name, 'score', b.score) order by i.position, b.entry_id)
        from base b join konk_items i on i.id = b.item_id join konk_offices o on o.id = b.office_id
        where not b.hidden and b.comment is not null and btrim(b.comment) <> ''), '[]'::jsonb)
  ) into res;
  return res;
end $$;
