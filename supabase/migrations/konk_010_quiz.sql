-- konk_010: party quiz (romquiz). Prefiks konk_quiz_*, rører ikke tlm_*.
-- Server-styrt spillmotor som RPC-er. Klienten leser/skriver ALDRI tabellene direkte (unntatt admin på spørsmålsbanken).

-- ---------------------------------------------------------------- spørsmålsbank
create table public.konk_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  theme text not null default 'jul' check (char_length(theme) between 1 and 40),
  question text not null check (char_length(question) between 3 and 300),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct smallint not null check (correct between 0 and 3),
  explanation text not null default '' check (char_length(explanation) <= 500),
  source text check (source is null or char_length(source) <= 300),
  hidden boolean not null default false,
  created_by uuid references public.konk_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index konk_quiz_questions_theme_idx on public.konk_quiz_questions (theme) where not hidden;
create index konk_quiz_questions_created_by_idx on public.konk_quiz_questions (created_by);

-- Alle fire alternativer må være ikke-tomme tekster (maks 120 tegn) og ulike
create function public.konk_quiz_check_question() returns trigger
language plpgsql set search_path = public as $$
declare v text; seen text[] := '{}'; i int;
begin
  for i in 0..3 loop
    if jsonb_typeof(new.options -> i) <> 'string' then raise exception 'Alternativ % må være tekst', i + 1; end if;
    v := btrim(new.options ->> i);
    if v = '' or char_length(v) > 120 then raise exception 'Alternativ % må være 1–120 tegn', i + 1; end if;
    if lower(v) = any(seen) then raise exception 'Alternativene må være ulike'; end if;
    seen := seen || lower(v);
  end loop;
  return new;
end $$;
create trigger konk_quiz_questions_check before insert or update on public.konk_quiz_questions
  for each row execute function public.konk_quiz_check_question();

alter table public.konk_quiz_questions enable row level security;
create policy quiz_questions_admin on public.konk_quiz_questions for all to authenticated
  using ((select public.konk_is_admin())) with check ((select public.konk_is_admin()));
revoke all on public.konk_quiz_questions from anon;

-- ---------------------------------------------------------------- rom, spillere, svar
create table public.konk_quiz_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{4}$'),
  host uuid not null references public.konk_profiles(id) on delete cascade,
  theme text,
  n_questions smallint not null default 5 check (n_questions between 1 and 20),
  seconds smallint not null default 30 check (seconds between 5 and 120),
  reveal_seconds smallint not null default 7 check (reveal_seconds between 2 and 20),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  questions jsonb,                       -- [{id, perm:[0..3 stokket]}]
  nr integer not null default 0,
  phase text check (phase in ('question', 'answer')),
  phase_start timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours',
  finished_at timestamptz
);
create index konk_quiz_rooms_host_idx on public.konk_quiz_rooms (host);

create table public.konk_quiz_players (
  room_id uuid not null references public.konk_quiz_rooms(id) on delete cascade,
  user_id uuid not null references public.konk_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index konk_quiz_players_user_idx on public.konk_quiz_players (user_id);

create table public.konk_quiz_answers (
  room_id uuid not null,
  user_id uuid not null,
  nr integer not null,
  choice smallint not null check (choice between -1 and 3),   -- plass i den stokkede lista; -1 = ikke svart
  correct boolean not null,
  ms integer not null,
  points integer not null,
  primary key (room_id, user_id, nr),
  foreign key (room_id, user_id) references public.konk_quiz_players (room_id, user_id) on delete cascade
);

create table public.konk_quiz_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.konk_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index konk_quiz_attempts_user_idx on public.konk_quiz_attempts (user_id, created_at desc);

alter table public.konk_quiz_rooms enable row level security;
alter table public.konk_quiz_players enable row level security;
alter table public.konk_quiz_answers enable row level security;
alter table public.konk_quiz_attempts enable row level security;
revoke all on public.konk_quiz_rooms, public.konk_quiz_players, public.konk_quiz_answers, public.konk_quiz_attempts from anon, authenticated;

-- ---------------------------------------------------------------- poeng
-- 100 grunnpoeng + opptil 80 i fartsbonus + 7 per riktig på rad (maks 3). Feil, uten svar eller for sent: 0.
create function public.konk_quiz_points(p_correct boolean, p_ms integer, p_streak integer, p_seconds integer)
returns integer language plpgsql immutable set search_path = public as $$
declare tid int := p_seconds * 1000; nett constant int := 1500;
begin
  if not p_correct or p_ms > tid + nett then return 0; end if;
  return 100 + ((greatest(0, tid - p_ms)::bigint * 80 + tid / 2) / tid)::int + 7 * least(greatest(0, p_streak), 3);
end $$;

-- ---------------------------------------------------------------- rangering (internt)
create function public.konk_quiz_ranking(p_room uuid, p_upto integer, p_me uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'office', t.office, 'points', t.points, 'correct', t.correct, 'me', t.me)
         order by t.points desc, t.correct desc, t.name), '[]'::jsonb)
  from (
    select case when pl.user_id = p_me then p.display_name when p.anonymous then 'Anonym' else p.display_name end as name,
           o.name as office, pl.user_id = p_me as me,
           coalesce((select sum(a.points) from konk_quiz_answers a where a.room_id = pl.room_id and a.user_id = pl.user_id and a.nr <= p_upto), 0)::int as points,
           coalesce((select count(*) from konk_quiz_answers a where a.room_id = pl.room_id and a.user_id = pl.user_id and a.nr <= p_upto and a.correct), 0)::int as correct
    from konk_quiz_players pl
    join konk_profiles p on p.id = pl.user_id
    join konk_offices o on o.id = p.office_id
    where pl.room_id = p_room
  ) t
$$;

create function public.konk_quiz_offices(p_room uuid, p_upto integer) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('office', t.office, 'players', t.players, 'points', t.points,
                                              'avg', round(t.points::numeric / nullif(t.players, 0), 1), 'correct', t.correct)
         order by t.points desc, t.office), '[]'::jsonb)
  from (
    select o.name as office, count(distinct pl.user_id) as players,
           coalesce(sum(a.points), 0)::int as points, coalesce(sum((a.correct)::int), 0)::int as correct
    from konk_quiz_players pl
    join konk_profiles p on p.id = pl.user_id
    join konk_offices o on o.id = p.office_id
    left join konk_quiz_answers a on a.room_id = pl.room_id and a.user_id = pl.user_id and a.nr <= p_upto
    where pl.room_id = p_room
    group by o.id, o.name
  ) t
$$;

-- ---------------------------------------------------------------- framdrift (internt, kalles ved hvert kall)
-- spørsmål -> fasit -> neste/ferdig. Går videre når alle aktive har svart eller tiden er ute.
create function public.konk_quiz_advance(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r konk_quiz_rooms;
  c_nett constant int := 1500;
  c_aktiv constant int := 15;
  v_ms int; v_tid int; v_waiting int; i int := 0;
begin
  select * into r from konk_quiz_rooms where id = p_room for update;
  if not found then return; end if;
  v_tid := r.seconds * 1000;
  while i < 10 and r.status = 'playing' loop
    i := i + 1;
    v_ms := round(extract(epoch from (clock_timestamp() - r.phase_start)) * 1000)::int;
    if r.phase = 'question' then
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

create function public.konk_quiz_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from konk_quiz_rooms where expires_at < now() or (status = 'finished' and finished_at < now() - interval '24 hours');
  delete from konk_quiz_attempts where created_at < now() - interval '1 hour';
$$;

-- ---------------------------------------------------------------- RPC: lag rom (bare admin)
create function public.konk_quiz_room_create(
  p_theme text default null, p_count integer default 5, p_seconds integer default 30,
  p_reveal integer default 7, p_host_plays boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c_alfabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_theme text := nullif(btrim(coalesce(p_theme, '')), '');
  v_code text; v_room konk_quiz_rooms; i int; k int;
begin
  if v_me is null then raise exception 'Logg inn.'; end if;
  if not konk_is_admin() then raise exception 'Bare admin kan lage quiz-rom.'; end if;
  if p_count not between 1 and 20 then raise exception 'Antall spørsmål må være 1–20.'; end if;
  if p_seconds not between 5 and 120 then raise exception 'Tid per spørsmål må være 5–120 sekunder.'; end if;
  if p_reveal not between 2 and 20 then raise exception 'Tid for fasit må være 2–20 sekunder.'; end if;
  perform konk_quiz_cleanup();
  if (select count(*) from konk_quiz_rooms where host = v_me and status <> 'finished') >= 3 then
    raise exception 'Du har allerede 3 rom i gang. Avslutt et av dem først.';
  end if;
  if (select count(*) from konk_quiz_questions where not hidden and (v_theme is null or theme = v_theme)) < p_count then
    raise exception 'Det er for få spørsmål i banken til en runde på % spørsmål.', p_count;
  end if;
  for i in 1..30 loop
    v_code := '';
    for k in 1..4 loop v_code := v_code || substr(c_alfabet, 1 + floor(random() * length(c_alfabet))::int, 1); end loop;
    exit when not exists (select 1 from konk_quiz_rooms where code = v_code);
    v_code := null;
  end loop;
  if v_code is null then raise exception 'Fikk ikke laget en kode. Prøv igjen.'; end if;
  insert into konk_quiz_rooms (code, host, theme, n_questions, seconds, reveal_seconds)
    values (v_code, v_me, v_theme, p_count, p_seconds, p_reveal) returning * into v_room;
  if p_host_plays then insert into konk_quiz_players (room_id, user_id) values (v_room.id, v_me); end if;
  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

-- ---------------------------------------------------------------- RPC: bli med
create function public.konk_quiz_room_join(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c_maks constant int := 50;
  c_feil_maks constant int := 10;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_room konk_quiz_rooms;
begin
  if v_me is null then raise exception 'Logg inn.'; end if;
  if (select count(*) from konk_quiz_attempts where user_id = v_me and created_at > now() - interval '1 minute') >= c_feil_maks then
    return jsonb_build_object('error', 'too_many');
  end if;
  select * into v_room from konk_quiz_rooms where code = v_code for update;
  -- Feil telles og SVARES (ikke kastes): et unntak ruller tilbake raden som telte forsøket.
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

-- ---------------------------------------------------------------- RPC: start (bare verten)
create function public.konk_quiz_room_start(p_code text) returns jsonb
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
  update konk_quiz_rooms set status = 'playing', questions = v_spm, nr = 0, phase = 'question', phase_start = clock_timestamp()
    where id = v_room.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- RPC: svar
create function public.konk_quiz_room_answer(p_code text, p_nr integer, p_choice integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  c_nett constant int := 1500;
  v_room konk_quiz_rooms;
  v_q konk_quiz_questions;
  v_perm jsonb; v_ms int; v_pos int; v_correct boolean; v_serie int := 0; k int;
begin
  if v_me is null then raise exception 'Logg inn.'; end if;
  if p_choice is null or p_choice < -1 or p_choice > 3 then raise exception 'Velg ett av alternativene.'; end if;
  select * into v_room from konk_quiz_rooms where code = upper(btrim(coalesce(p_code, '')));
  if not found or v_room.expires_at < now() then raise exception 'Fant ikke rommet.'; end if;
  if not exists (select 1 from konk_quiz_players where room_id = v_room.id and user_id = v_me) then
    raise exception 'Du er ikke med i dette rommet.';
  end if;
  update konk_quiz_players set last_seen = now() where room_id = v_room.id and user_id = v_me;
  perform konk_quiz_advance(v_room.id);
  select * into v_room from konk_quiz_rooms where id = v_room.id;
  if v_room.status <> 'playing' then raise exception 'Rommet spiller ikke akkurat nå.'; end if;
  if v_room.phase <> 'question' or p_nr is distinct from v_room.nr then raise exception 'Spørsmålet er allerede avgjort.'; end if;
  if exists (select 1 from konk_quiz_answers where room_id = v_room.id and user_id = v_me and nr = v_room.nr) then
    raise exception 'Du har allerede svart på dette spørsmålet.';
  end if;
  select * into v_q from konk_quiz_questions where id = (v_room.questions -> v_room.nr ->> 'id')::uuid;
  if not found then raise exception 'Spørsmålet er fjernet fra banken.'; end if;
  v_perm := v_room.questions -> v_room.nr -> 'perm';
  v_ms := round(extract(epoch from (clock_timestamp() - v_room.phase_start)) * 1000)::int;
  v_pos := case when p_choice = -1 then -1 else (v_perm ->> p_choice)::int end;
  v_correct := v_pos = v_q.correct and v_ms <= v_room.seconds * 1000 + c_nett;
  k := v_room.nr - 1;
  while k >= 0 and exists (select 1 from konk_quiz_answers where room_id = v_room.id and user_id = v_me and nr = k and correct) loop
    v_serie := v_serie + 1; k := k - 1;
  end loop;
  insert into konk_quiz_answers (room_id, user_id, nr, choice, correct, ms, points)
    values (v_room.id, v_me, v_room.nr, p_choice, v_correct, least(v_ms, 3600000),
            konk_quiz_points(v_correct, v_ms, v_serie, v_room.seconds));
  perform konk_quiz_advance(v_room.id);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- RPC: tilstand (spørres hvert 1–2 sekund)
create function public.konk_quiz_room_state(p_code text) returns jsonb
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

-- ---------------------------------------------------------------- RPC: verten hopper videre / avslutter / lister rom
create function public.konk_quiz_room_skip(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_room konk_quiz_rooms;
begin
  if v_me is null then raise exception 'Logg inn.'; end if;
  select * into v_room from konk_quiz_rooms where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found or v_room.expires_at < now() then raise exception 'Fant ikke rommet.'; end if;
  if v_room.host is distinct from v_me then raise exception 'Bare verten kan styre runden.'; end if;
  if v_room.status <> 'playing' then raise exception 'Rommet spiller ikke akkurat nå.'; end if;
  if v_room.phase = 'question' then
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

create function public.konk_quiz_room_close(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_room konk_quiz_rooms;
begin
  if v_me is null then raise exception 'Logg inn.'; end if;
  select * into v_room from konk_quiz_rooms where code = upper(btrim(coalesce(p_code, '')));
  if not found then return jsonb_build_object('ok', true); end if;
  if v_room.host is distinct from v_me and not konk_is_admin() then raise exception 'Bare verten kan avslutte rommet.'; end if;
  delete from konk_quiz_rooms where id = v_room.id;
  return jsonb_build_object('ok', true);
end $$;

create function public.konk_quiz_my_rooms() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'status', r.status, 'theme', r.theme, 'created_at', r.created_at,
         'players', (select count(*) from konk_quiz_players pl where pl.room_id = r.id)) order by r.created_at desc), '[]'::jsonb)
  from konk_quiz_rooms r where r.host = auth.uid() and r.expires_at > now() and r.status <> 'finished'
$$;

create function public.konk_quiz_themes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('theme', t.theme, 'n', t.n) order by t.theme), '[]'::jsonb)
  from (select theme, count(*) n from konk_quiz_questions where not hidden group by theme) t
  where konk_is_admin()
$$;

-- ---------------------------------------------------------------- tilgang
revoke execute on function public.konk_quiz_advance(uuid), public.konk_quiz_cleanup(),
  public.konk_quiz_ranking(uuid, integer, uuid), public.konk_quiz_offices(uuid, integer),
  public.konk_quiz_check_question() from public, anon, authenticated;
revoke execute on function
  public.konk_quiz_points(boolean, integer, integer, integer),
  public.konk_quiz_room_create(text, integer, integer, integer, boolean),
  public.konk_quiz_room_join(text), public.konk_quiz_room_start(text),
  public.konk_quiz_room_answer(text, integer, integer), public.konk_quiz_room_state(text),
  public.konk_quiz_room_skip(text), public.konk_quiz_room_close(text),
  public.konk_quiz_my_rooms(), public.konk_quiz_themes()
  from public, anon;
grant execute on function
  public.konk_quiz_points(boolean, integer, integer, integer),
  public.konk_quiz_room_create(text, integer, integer, integer, boolean),
  public.konk_quiz_room_join(text), public.konk_quiz_room_start(text),
  public.konk_quiz_room_answer(text, integer, integer), public.konk_quiz_room_state(text),
  public.konk_quiz_room_skip(text), public.konk_quiz_room_close(text),
  public.konk_quiz_my_rooms(), public.konk_quiz_themes()
  to authenticated;
