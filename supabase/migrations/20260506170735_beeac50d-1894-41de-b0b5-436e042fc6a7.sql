-- Add section_type column
ALTER TABLE public.survey_sections 
ADD COLUMN section_type text NOT NULL DEFAULT 'organization';

-- Mark leadership sections for Tectaris survey
UPDATE public.survey_sections 
SET section_type = 'leadership'
WHERE survey_id = '1aef6816-fa1b-49bf-b974-fc996e9eff63'
  AND title ILIKE '%liderança%';

-- Reorder Tectaris sections: org first, then leadership, then open/eNPS
-- Credibilidade (was 1) -> 0
UPDATE public.survey_sections SET sort_order = 0 WHERE id = 'c9ee5f2a-44ef-4587-8e09-c3c18bb9e2d3';
-- Respeito (was 2) -> 1
UPDATE public.survey_sections SET sort_order = 1 WHERE id = 'a102092c-cfd2-4d95-be55-a30032f52643';
-- Imparcialidade (was 3) -> 2
UPDATE public.survey_sections SET sort_order = 2 WHERE id = '3eac43c6-36da-439f-a01d-2ff567d52331';
-- Camaradagem (was 4) -> 3
UPDATE public.survey_sections SET sort_order = 3 WHERE id = '3230c503-9992-4b60-92e3-b0eefcd55cee';
-- Orgulho (was 5) -> 4
UPDATE public.survey_sections SET sort_order = 4 WHERE id = 'f213000f-985b-40f0-98ec-60179df078b1';
-- Crescimento e Desenvolvimento (was 6) -> 5
UPDATE public.survey_sections SET sort_order = 5 WHERE id = 'a28607b8-21b6-4c8a-9877-99b9bdfd7516';
-- Remuneração e Reconhecimento (was 7) -> 6
UPDATE public.survey_sections SET sort_order = 6 WHERE id = '9ae44720-ccaf-4938-854c-c74e437906ba';
-- Organização e Processos (was 8) -> 7
UPDATE public.survey_sections SET sort_order = 7 WHERE id = '3d48bbee-548a-4e5a-ae06-af78e6f7ce3e';
-- Perguntas Abertas (was 9) -> 8
UPDATE public.survey_sections SET sort_order = 8 WHERE id = '0fd80e2c-5b56-4eae-9196-71ee9baba309';
-- Recomendação eNPS (was 10) -> 9
UPDATE public.survey_sections SET sort_order = 9 WHERE id = '83c3f881-bad4-49ce-a04d-f9239a7808aa';
-- Confiança na Liderança (was 0) -> 10 (leadership, shown last per leader)
UPDATE public.survey_sections SET sort_order = 10 WHERE id = '462450c9-aba0-4211-a8b9-569a753b7f9e';