
ALTER TABLE public.surveys ADD COLUMN leaders jsonb DEFAULT '[]'::jsonb;
