GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnostics TO authenticated;
GRANT SELECT ON public.diagnostics TO anon;
GRANT ALL ON public.diagnostics TO service_role;
GRANT SELECT, DELETE ON public.diagnostic_submissions TO authenticated;
GRANT ALL ON public.diagnostic_submissions TO service_role;