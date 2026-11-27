-- Admin kan skjule konkurranser (visible) og velge rekkefølgen på forsiden (sort_order).
alter table public.konk_competitions
  add column if not exists visible boolean not null default true,
  add column if not exists sort_order integer not null default 0;

update public.konk_competitions c set sort_order = r.n * 10
from (select id, row_number() over (order by created_at, title) n from public.konk_competitions) r
where r.id = c.id and c.sort_order = 0;

drop policy if exists competitions_read on public.konk_competitions;
create policy competitions_read on public.konk_competitions for select
  using (((visible and status <> 'draft'::text) or (select konk_is_admin())));
