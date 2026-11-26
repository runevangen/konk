-- Maks antall spillere per quiz-rom: 50 -> 100.
create or replace function public.konk_quiz_room_join(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c_maks constant int := 100;
  c_feil_maks constant int := 10;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_room konk_quiz_rooms;
begin
  if v_me is null then raise exception 'Logg inn.'; end if;
  if (select count(*) from konk_quiz_attempts where user_id = v_me and created_at > now() - interval '1 minute') >= c_feil_maks then
    return jsonb_build_object('error', 'too_many');
  end if;
  select * into v_room from konk_quiz_rooms where code = v_code for update;
  if not found or v_room.expires_at < now() then
    insert into konk_quiz_attempts (user_id) values (v_me);
    return jsonb_build_object('error', 'not_found');
  end if;
  if exists (select 1 from konk_quiz_players where room_id = v_room.id and user_id = v_me) then
    return jsonb_build_object('ok', true, 'code', v_room.code);
  end if;
  if v_room.status <> 'lobby' then return jsonb_build_object('error', 'started'); end if;
  if (select count(*) from konk_quiz_players where room_id = v_room.id) >= c_maks then
    return jsonb_build_object('error', 'full');
  end if;
  insert into konk_quiz_players (room_id, user_id) values (v_room.id, v_me);
  return jsonb_build_object('ok', true, 'code', v_room.code);
end $$;
