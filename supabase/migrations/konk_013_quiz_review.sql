-- Kvalitetssikring per spørsmål: kildenivå (1 = beste kilde), status og merknad. Usikre spørsmål kan skjules når de importeres.
alter table public.konk_quiz_questions
  add column if not exists source_level smallint check (source_level is null or source_level between 1 and 5),
  add column if not exists review_status text check (review_status is null or review_status in ('ok', 'usikker')),
  add column if not exists review_note text check (review_note is null or char_length(review_note) <= 600);
