ALTER PUBLICATION supabase_realtime ADD TABLE public.survey_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.respondents;
ALTER TABLE public.survey_responses REPLICA IDENTITY FULL;
ALTER TABLE public.respondents REPLICA IDENTITY FULL;