-- Admin kan slette svar (entries) og tilbakemeldinger. Vanlige brukere kan fortsatt ikke slette svar.
create policy admin_delete on public.konk_entries for delete to authenticated
  using ((select public.konk_is_admin()));
create policy admin_delete on public.konk_feedback for delete to authenticated
  using ((select public.konk_is_admin()));
