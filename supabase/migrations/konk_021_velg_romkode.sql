-- Admin velger koden selv (fire bokstaver). Sjekker at den er gyldig og ledig (ikke brukt av en annen konkurranse eller et quiz-rom).
create or replace function public.konk_set_comp_code(p_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text := upper(btrim(coalesce(p_code, '')));
begin
  if not (select konk_is_admin()) then raise exception 'Bare admin.'; end if;
  if c !~ '^[A-Z]{4}$' then return jsonb_build_object('error', 'invalid'); end if;
  if exists (select 1 from konk_competitions where code = c and id <> p_id)
     or exists (select 1 from konk_quiz_rooms where code = c) then
    return jsonb_build_object('error', 'in_use');
  end if;
  update konk_competitions set code = c where id = p_id;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'code', c);
end $$;
revoke all on function public.konk_set_comp_code(uuid, text) from public, anon;
grant execute on function public.konk_set_comp_code(uuid, text) to authenticated;
