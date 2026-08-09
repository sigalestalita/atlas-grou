CREATE TABLE public.report_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX report_access_codes_company_code_idx ON public.report_access_codes (company_id, upper(code));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_access_codes TO authenticated;
GRANT ALL ON public.report_access_codes TO service_role;

ALTER TABLE public.report_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage report access codes"
ON public.report_access_codes FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company admins can view their report access codes"
ON public.report_access_codes FOR SELECT TO authenticated
USING (company_id = get_user_company_id(auth.uid()));