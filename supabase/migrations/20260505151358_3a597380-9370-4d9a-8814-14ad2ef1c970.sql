
-- Role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'company_admin');

-- Companies table
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#3B82F6',
  secondary_color TEXT NOT NULL DEFAULT '#1E40AF',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, company_id)
);

-- Surveys table
CREATE TABLE public.surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  scale_min INTEGER NOT NULL DEFAULT 1,
  scale_max INTEGER NOT NULL DEFAULT 5,
  scale_labels JSONB DEFAULT '["Discordo totalmente","Discordo","Neutro","Concordo","Concordo totalmente"]',
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Survey sections
CREATE TABLE public.survey_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Survey questions
CREATE TABLE public.survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.survey_sections(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Respondents (tracking only - NOT linked to answers)
CREATE TABLE public.respondents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  department TEXT,
  company_leadership TEXT,
  department_leadership TEXT,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'responded')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Survey responses (ANONYMOUS - no link to respondent)
CREATE TABLE public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  value INTEGER NOT NULL,
  department TEXT,
  company_leadership TEXT,
  department_leadership TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.user_roles
  WHERE user_id = _user_id AND role = 'company_admin'
  LIMIT 1
$$;

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respondents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- COMPANIES policies
CREATE POLICY "Super admins can do everything with companies" ON public.companies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can view their company" ON public.companies
  FOR SELECT TO authenticated
  USING (id = public.get_user_company_id(auth.uid()));

-- USER_ROLES policies
CREATE POLICY "Super admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- SURVEYS policies
CREATE POLICY "Super admins can do everything with surveys" ON public.surveys
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage their surveys" ON public.surveys
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Anyone can view active surveys" ON public.surveys
  FOR SELECT TO anon
  USING (status = 'active');

-- SURVEY_SECTIONS policies
CREATE POLICY "Super admins can do everything with sections" ON public.survey_sections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage their sections" ON public.survey_sections
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = survey_id AND s.company_id = public.get_user_company_id(auth.uid())
  ));

CREATE POLICY "Anyone can view sections of active surveys" ON public.survey_sections
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = survey_id AND s.status = 'active'
  ));

-- SURVEY_QUESTIONS policies
CREATE POLICY "Super admins can do everything with questions" ON public.survey_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage their questions" ON public.survey_questions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.survey_sections sec
    JOIN public.surveys s ON s.id = sec.survey_id
    WHERE sec.id = section_id AND s.company_id = public.get_user_company_id(auth.uid())
  ));

CREATE POLICY "Anyone can view questions of active surveys" ON public.survey_questions
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.survey_sections sec
    JOIN public.surveys s ON s.id = sec.survey_id
    WHERE sec.id = section_id AND s.status = 'active'
  ));

-- RESPONDENTS policies
CREATE POLICY "Super admins can do everything with respondents" ON public.respondents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can manage their respondents" ON public.respondents
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- SURVEY_RESPONSES policies
CREATE POLICY "Super admins can view all responses" ON public.survey_responses
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company admins can view their responses" ON public.survey_responses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id = survey_id AND s.company_id = public.get_user_company_id(auth.uid())
  ));

CREATE POLICY "Anonymous users can insert responses" ON public.survey_responses
  FOR INSERT TO anon
  WITH CHECK (true);

-- Index for token lookups
CREATE INDEX idx_respondents_token ON public.respondents(token);
CREATE INDEX idx_respondents_company_survey ON public.respondents(company_id, survey_id);
CREATE INDEX idx_survey_responses_survey ON public.survey_responses(survey_id);
CREATE INDEX idx_companies_slug ON public.companies(slug);
