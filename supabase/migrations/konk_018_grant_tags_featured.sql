-- Oppdateringer er gitt kolonne for kolonne; de nye kolonnene må inn. «featured» er trygt fordi triggeren nullstiller den for alle som ikke er admin.
grant update (tags, featured) on public.konk_entries to authenticated;
