-- Upsert fra klient krever update-rett på user_id/item_id; trigger forbyr faktisk endring.
grant update (user_id, item_id) on public.konk_entries to authenticated;

create or replace function public.konk_check_entry() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.item_id is distinct from old.item_id) then
    raise exception 'user_id and item_id cannot be changed';
  end if;
  if new.guess_option_id is not null and not exists (
    select 1 from konk_items i join konk_guess_options o on o.competition_id = i.competition_id
    where i.id = new.item_id and o.id = new.guess_option_id) then
    raise exception 'guess option belongs to another competition';
  end if;
  new.updated_at := now();
  return new;
end $$;
