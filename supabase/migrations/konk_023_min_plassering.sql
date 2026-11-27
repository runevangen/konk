-- Hvor mange riktige du fikk, sammenlignet med beste, dårligste og snittet. Bare for avsluttede konkurranser.
-- Bare tall (ingen navn). Beste, dårligste og snitt gis først når minst tre har deltatt, så ingen enkeltperson kan kjennes igjen.
create or replace function public.konk_my_standing(p_competition uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_status text; v_me uuid := auth.uid(); res jsonb; v_n int;
begin
  if v_me is null then raise exception 'Logg inn.'; end if;
  select status into v_status from konk_competitions where id = p_competition;
  if v_status is null or (v_status <> 'closed' and not (select konk_is_admin())) then raise exception 'not_closed'; end if;
  with per as (
    select e.user_id,
           count(*) filter (where e.guess_option_id is not null and e.guess_option_id = a.correct_option_id) as hits,
           count(*) filter (where e.guess_option_id is not null) as guesses
    from konk_entries e
    join konk_items i on i.id = e.item_id and i.competition_id = p_competition
    left join konk_item_answers a on a.item_id = e.item_id
    group by e.user_id
  ), me as (select hits, guesses from per where user_id = v_me)
  select count(*) into v_n from per;
  with per as (
    select e.user_id,
           count(*) filter (where e.guess_option_id is not null and e.guess_option_id = a.correct_option_id) as hits,
           count(*) filter (where e.guess_option_id is not null) as guesses
    from konk_entries e
    join konk_items i on i.id = e.item_id and i.competition_id = p_competition
    left join konk_item_answers a on a.item_id = e.item_id
    group by e.user_id
  ), me as (select hits, guesses from per where user_id = v_me)
  select jsonb_build_object(
    'n', v_n,
    'total', (select count(*) from konk_items i join konk_item_answers a on a.item_id = i.id where i.competition_id = p_competition),
    'my_hits', (select hits from me), 'my_guesses', (select guesses from me),
    'best', case when v_n >= 3 then (select max(hits) from per) end,
    'worst', case when v_n >= 3 then (select min(hits) from per) end,
    'avg', case when v_n >= 3 then (select round(avg(hits)::numeric, 1) from per) end,
    'rank', (select 1 + count(*) from per where hits > (select hits from me)),
    'tied', (select count(*) from per where hits = (select hits from me))
  ) into res;
  return res;
end $$;
revoke all on function public.konk_my_standing(uuid) from public, anon;
grant execute on function public.konk_my_standing(uuid) to authenticated;
