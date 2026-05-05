ALTER TABLE public.respondents ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.respondents ALTER COLUMN name SET DEFAULT '';