-- Dublett-regelen i databasen skal være lik den i appen: store/små bokstaver og alle mellomrom (også inni teksten) teller ikke.
drop index if exists public.konk_quiz_questions_unique_idx;
create unique index konk_quiz_questions_unique_idx
  on public.konk_quiz_questions (theme, lower(regexp_replace(btrim(question), '\s+', ' ', 'g')));
