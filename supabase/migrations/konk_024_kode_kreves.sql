-- Konkurranser krever kode som standard: nye brukere ser dem ikke før de har skrevet inn koden.
-- (visible = true betyr «åpen for alle innloggede», og må velges uttrykkelig av admin.)
alter table public.konk_competitions alter column visible set default false;

-- De som alt har svart beholder tilgangen (de er med).
insert into public.konk_comp_members (user_id, competition_id)
select distinct e.user_id, i.competition_id
from public.konk_entries e join public.konk_items i on i.id = e.item_id
on conflict do nothing;

-- Eksisterende konkurranser krever kode fra nå av.
update public.konk_competitions set visible = false where visible;
