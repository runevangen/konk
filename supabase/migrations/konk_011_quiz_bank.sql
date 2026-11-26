-- Spørsmålsbank: kategori og vanskelighet, og ingen dubletter per tema.
alter table public.konk_quiz_questions
  add column if not exists category text check (category is null or char_length(category) between 1 and 40),
  add column if not exists difficulty text check (difficulty is null or char_length(difficulty) between 1 and 20);

create unique index if not exists konk_quiz_questions_unique_idx
  on public.konk_quiz_questions (theme, lower(btrim(question)));
