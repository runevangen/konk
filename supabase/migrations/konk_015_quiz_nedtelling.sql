-- 10 sekunders nedtelling mellom «Start» og første spørsmål. Serveren styrer den (fase 'countdown'),
-- og spørsmålet sendes ikke før den er ferdig.
alter table public.konk_quiz_rooms drop constraint if exists konk_quiz_rooms_phase_check;
alter table public.konk_quiz_rooms add constraint konk_quiz_rooms_phase_check check (phase = any (array['countdown','question','answer']));

create or replace function public.konk_quiz_room_start(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_room konk_quiz_rooms;
  v_spm jsonb;
begin
  if v_me is null then raise exception 'Logg inn.'; end if;
  select * into v_room from konk_quiz_rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found or v_room.expires_at < now() then raise exception 'Fant ikke rommet.'; end if;
  if v_room.host is distinct from v_me then raise exception 'Bare verten kan starte.'; end if;
  if v_room.status <> 'lobby' then raise exception 'Runden har allerede startet.'; end if;
  if (select count(*) from konk_quiz_players where room_id = v_room.id) < 2 then
    raise exception 'Vent til minst to spillere er med.';
  end if;
  select jsonb_agg(jsonb_build_object('id', q.id, 'perm', pm.perm) order by q.rn) into v_spm
    from (select g.id, row_number() over (order by random()) rn from konk_quiz_questions g
          where not g.hidden and (v_room.theme is null or g.theme = v_room.theme)) q
    cross join lateral (select jsonb_agg(p order by random()) perm from generate_series(0, 3) p) pm
    where q.rn <= v_room.n_questions;
  if v_spm is null or jsonb_array_length(v_spm) < v_room.n_questions then
    raise exception 'Det er for få spørsmål i banken til en runde.';
  end if;
  update konk_quiz_rooms set status = 'playing', questions = v_spm, nr = 0, phase = 'countdown', phase_start = clock_timestamp()
    where id = v_room.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.konk_quiz_advance(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r konk_quiz_rooms;
  c_nett constant int := 1500;
  c_aktiv constant int := 15;
  c_nedtelling constant int := 10000;
  v_ms int; v_tid int; v_waiting int; i int := 0;
begin
  select * into r from konk_quiz_rooms where id = p_room for update;
  if not found then return; end if;
  v_tid := r.seconds * 1000;
  while i < 10 and r.status = 'playing' loop
    i := i + 1;
    v_ms := round(extract(epoch from (clock_timestamp() - r.phase_start)) * 1000)::int;
    if r.phase = 'countdown' then
      if v_ms >= c_nedtelling then
        update konk_quiz_rooms set phase = 'question', phase_start = clock_timestamp() where id = r.id returning * into r;
      else
        exit;
      end if;
    elsif r.phase = 'question' then
      select count(*) into v_waiting from konk_quiz_players s
        where s.room_id = r.id and s.last_seen > now() - make_interval(secs => c_aktiv)
          and not exists (select 1 from konk_quiz_answers a where a.room_id = r.id and a.user_id = s.user_id and a.nr = r.nr);
      if v_ms >= v_tid + c_nett or (v_waiting = 0 and exists (select 1 from konk_quiz_players where room_id = r.id)) then
        insert into konk_quiz_answers (room_id, user_id, nr, choice, correct, ms, points)
          select r.id, s.user_id, r.nr, -1, false, v_tid, 0 from konk_quiz_players s
          where s.room_id = r.id
            and not exists (select 1 from konk_quiz_answers a where a.room_id = r.id and a.user_id = s.user_id and a.nr = r.nr);
        update konk_quiz_rooms set phase = 'answer', phase_start = clock_timestamp() where id = r.id returning * into r;
      else
        exit;
      end if;
    elsif r.phase = 'answer' then
      if v_ms >= r.reveal_seconds * 1000 then
        if r.nr + 1 >= jsonb_array_length(r.questions) then
          update konk_quiz_rooms set status = 'finished', phase = null, finished_at = now() where id = r.id returning * into r;
        else
          update konk_quiz_rooms set nr = nr + 1, phase = 'question', phase_start = clock_timestamp() where id = r.id returning * into r;
        end if;
      else
        exit;
      end if;
    else
      exit;
    end if;
  end loop;
end $$;

create or replace function public.konk_quiz_room_skip(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_room konk_quiz_rooms;
begin
  if v_me is null then raise exception 'Logg inn.'; end if;
  select * into v_room from konk_quiz_rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found or v_room.expires_at < now() then raise exception 'Fant ikke rommet.'; end if;
  if v_room.host is distinct from v_me then raise exception 'Bare verten kan styre runden.'; end if;
  if v_room.status <> 'playing' then raise exception 'Rommet spiller ikke akkurat nå.'; end if;
  if v_room.phase = 'countdown' then
    update konk_quiz_rooms set phase = 'question', phase_start = clock_timestamp() where id = v_room.id;
  elsif v_room.phase = 'question' then
    insert into konk_quiz_answers (room_id, user_id, nr, choice, correct, ms, points)
      select v_room.id, s.user_id, v_room.nr, -1, false, v_room.seconds * 1000, 0 from konk_quiz_players s
      where s.room_id = v_room.id
        and not exists (select 1 from konk_quiz_answers a where a.room_id = v_room.id and a.user_id = s.user_id and a.nr = v_room.nr);
    update konk_quiz_rooms set phase = 'answer', phase_start = clock_timestamp() where id = v_room.id;
  elsif v_room.nr + 1 >= jsonb_array_length(v_room.questions) then
    update konk_quiz_rooms set status = 'finished', phase = null, finished_at = now() where id = v_room.id;
  else
    update konk_quiz_rooms set nr = nr + 1, phase = 'question', phase_start = clock_timestamp() where id = v_room.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.konk_quiz_room_state(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_room konk_quiz_rooms;
  v_is_host boolean; v_is_player boolean;
  v_ms int; v_q konk_quiz_questions; v_perm jsonb; v_opts jsonb; v_my konk_quiz_answers;
  v_out jsonb; v_fasit int;
begin
  if v_me is null then raise exception 'Logg inn.'; end if;
  select * into v_room from konk_quiz_rooms where code = upper(btrim(coalesce(p_code, '')));
  if not found or v_room.expires_at < now() then return jsonb_build_object('error', 'not_found'); end if;
  v_is_host := v_room.host = v_me;
  v_is_player := exists (select 1 from konk_quiz_players where room_id = v_room.id and user_id = v_me);
  if not (v_is_player or v_is_host or konk_is_admin()) then return jsonb_build_object('error', 'not_member'); end if;
  if v_is_player then update konk_quiz_players set last_seen = now() where room_id = v_room.id and user_id = v_me; end if;
  perform konk_quiz_advance(v_room.id);
  select * into v_room from konk_quiz_rooms where id = v_room.id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;

  v_out := jsonb_build_object(
    'code', v_room.code, 'status', v_room.status, 'theme', v_room.theme,
    'is_host', v_is_host, 'is_player', v_is_player,
    'n_questions', v_room.n_questions, 'seconds', v_room.seconds, 'reveal_seconds', v_room.reveal_seconds,
    'players', (select coalesce(jsonb_agg(jsonb_build_object(
                  'name', case when pl.user_id = v_me then p.display_name when p.anonymous then 'Anonym' else p.display_name end,
                  'office', o.name, 'host', pl.user_id = v_room.host, 'me', pl.user_id = v_me) order by pl.joined_at), '[]'::jsonb)
                from konk_quiz_players pl join konk_profiles p on p.id = pl.user_id join konk_offices o on o.id = p.office_id
                where pl.room_id = v_room.id));

  if v_room.status = 'playing' then
    v_ms := round(extract(epoch from (clock_timestamp() - v_room.phase_start)) * 1000)::int;
    if v_room.phase = 'countdown' then
      -- Ingen spørsmål eller svaralternativer før nedtellingen er ferdig.
      return v_out || jsonb_build_object('nr', v_room.nr, 'phase', 'countdown', 'left_ms', greatest(0, 10000 - v_ms),
        'n_players', (select count(*) from konk_quiz_players where room_id = v_room.id));
    end if;
    select * into v_q from konk_quiz_questions where id = (v_room.questions -> v_room.nr ->> 'id')::uuid;
    if not found then return v_out || jsonb_build_object('error', 'question_missing'); end if;
    v_perm := v_room.questions -> v_room.nr -> 'perm';
    select jsonb_agg(to_jsonb(v_q.options ->> pe::int) order by ord) into v_opts
      from jsonb_array_elements_text(v_perm) with ordinality as t(pe, ord);
    select * into v_my from konk_quiz_answers where room_id = v_room.id and user_id = v_me and nr = v_room.nr;
    v_out := v_out || jsonb_build_object(
      'nr', v_room.nr, 'phase', v_room.phase, 'question', v_q.question, 'options', v_opts,
      'left_ms', greatest(0, (case when v_room.phase = 'question' then v_room.seconds else v_room.reveal_seconds end) * 1000 - v_ms),
      'answered', v_my.nr is not null and v_my.choice >= 0,
      'n_answered', (select count(*) from konk_quiz_answers where room_id = v_room.id and nr = v_room.nr and choice >= 0),
      'n_players', (select count(*) from konk_quiz_players where room_id = v_room.id));
    if v_room.phase = 'answer' then
      select (ord - 1)::int into v_fasit from jsonb_array_elements_text(v_perm) with ordinality as t(pe, ord) where pe::int = v_q.correct;
      v_out := v_out || jsonb_build_object(
        'correct_index', v_fasit, 'explanation', v_q.explanation,
        'mine', case when v_is_player then jsonb_build_object('choice', coalesce(v_my.choice, -1), 'correct', coalesce(v_my.correct, false), 'points', coalesce(v_my.points, 0)) end,
        'ranking', konk_quiz_ranking(v_room.id, v_room.nr, v_me),
        'offices', konk_quiz_offices(v_room.id, v_room.nr));
    end if;
  elsif v_room.status = 'finished' then
    v_out := v_out || jsonb_build_object(
      'ranking', konk_quiz_ranking(v_room.id, 1000000, v_me),
      'offices', konk_quiz_offices(v_room.id, 1000000));
  end if;
  return v_out;
end $$;
