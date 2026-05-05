
-- Create JA company
INSERT INTO public.companies (id, name, slug, primary_color, secondary_color, settings)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Junior Achievement POA',
  'ja-poa',
  '#1E3A5F',
  '#2E75B6',
  '{"leaderships": ["Aline Néglia – Administrativo", "Marcelo Bassani – Operações", "Karina Leira – Operações", "Elaine Boening – Rel. Institucionais"]}'::jsonb
);

-- Create survey
INSERT INTO public.surveys (id, company_id, title, description, scale_min, scale_max, scale_labels, status, is_template)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Pesquisa de Clima Organizacional JA 2026',
  'Pesquisa de Clima Organizacional – Junior Achievement POA 2026. Suas respostas são confidenciais e fundamentais para a melhoria contínua da JA.',
  1, 5,
  '["Discordo Totalmente", "Discordo", "Neutro", "Concordo", "Concordo Totalmente"]'::jsonb,
  'draft',
  false
);

-- Sections
INSERT INTO public.survey_sections (id, survey_id, title, sort_order) VALUES
('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Clima e Relacionamento', 0),
('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Liderança e Gestão', 1),
('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'Comunicação e Estratégia', 2),
('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'Imagem e Mercado', 3),
('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'Desenvolvimento e RH', 4),
('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', 'Cultura e Valores', 5),
('c0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000001', 'Encerramento', 6);

-- S1: Clima e Relacionamento (scale questions)
INSERT INTO public.survey_questions (section_id, text, sort_order, question_type, scale_type, has_justification, justification_prompt) VALUES
('c0000000-0000-0000-0000-000000000001', 'O relacionamento entre a sua equipe do trabalho diário é?', 0, 'scale', 'avaliacao', true, 'O que poderia melhorar?'),
('c0000000-0000-0000-0000-000000000001', 'Você sente segurança para propor melhorias no seu trabalho?', 1, 'scale', 'frequencia', true, 'Por que sim ou por que não?'),
('c0000000-0000-0000-0000-000000000001', 'Como você se sente em relação ao reconhecimento de seu trabalho?', 2, 'scale', 'satisfacao', true, 'O que poderia ser diferente?'),
('c0000000-0000-0000-0000-000000000001', 'Como você se sente em relação à frequência e forma que são dados feedbacks?', 3, 'scale', 'satisfacao', true, 'Como preferiria receber?'),
('c0000000-0000-0000-0000-000000000001', 'Em relação ao ambiente de trabalho você se sente:', 4, 'scale', 'satisfacao', false, NULL),
('c0000000-0000-0000-0000-000000000001', 'O seu nível de confiança na sua equipe de trabalho diária é:', 5, 'scale', 'confianca', false, NULL);

-- S2: Liderança e Gestão
-- Choice question
INSERT INTO public.survey_questions (section_id, text, sort_order, question_type, scale_type, options, has_justification, justification_prompt) VALUES
('c0000000-0000-0000-0000-000000000002', 'Você acredita que a sua liderança direta representa a cultura e os valores da JA?', 0, 'choice', NULL, '["Sim", "Não", "Em partes"]'::jsonb, true, 'Dê um exemplo:');
-- Scale questions
INSERT INTO public.survey_questions (section_id, text, sort_order, question_type, scale_type, has_justification, justification_prompt) VALUES
('c0000000-0000-0000-0000-000000000002', 'Você considera seu gestor um bom líder?', 1, 'scale', 'concordancia', true, 'Cite um ponto forte e um a melhorar:'),
('c0000000-0000-0000-0000-000000000002', 'Qual é o nível de abertura que o seu líder imediato tem para receber feedback?', 2, 'scale', 'confianca', false, NULL),
('c0000000-0000-0000-0000-000000000002', 'Qual é o nível de confiança que você tem no seu líder?', 3, 'scale', 'confianca', false, NULL),
('c0000000-0000-0000-0000-000000000002', 'Sobre a capacidade de resolução de problemas do seu líder: ele resolve as suas questões?', 4, 'scale', 'frequencia', true, 'Dê um exemplo:'),
('c0000000-0000-0000-0000-000000000002', 'Independente da posição em que ocupa, o líder é tratado com respeito?', 5, 'scale', 'concordancia', true, 'Algum exemplo ou situação?');

-- S3: Comunicação e Estratégia
INSERT INTO public.survey_questions (section_id, text, sort_order, question_type, scale_type, has_justification, justification_prompt) VALUES
('c0000000-0000-0000-0000-000000000003', 'Como é o fluxo de informações na JA?', 0, 'scale', 'avaliacao', true, 'O que falta ou poderia melhorar?'),
('c0000000-0000-0000-0000-000000000003', 'Como você avalia o processo de tomada de decisões da JA?', 1, 'scale', 'avaliacao', true, 'Explique sua avaliação:'),
('c0000000-0000-0000-0000-000000000003', 'Como você avalia a comunicação das estratégias definidas pela JA?', 2, 'scale', 'avaliacao', true, 'O que poderia ser melhorado?'),
('c0000000-0000-0000-0000-000000000003', 'Como você considera a definição das funções/cargos na JA?', 3, 'scale', 'avaliacao', true, 'Há algo que não está claro?'),
('c0000000-0000-0000-0000-000000000003', 'Você sente seu trabalho diário alinhado às metas globais da JA?', 4, 'scale', 'alinhamento', true, 'Por que sim ou por que não?'),
('c0000000-0000-0000-0000-000000000003', 'Você sente que recebe orientações claras sobre o que precisa entregar?', 5, 'scale', 'concordancia', true, 'Algum exemplo ou situação?');

-- S4: Imagem e Mercado
INSERT INTO public.survey_questions (section_id, text, sort_order, question_type, scale_type, has_justification, justification_prompt) VALUES
('c0000000-0000-0000-0000-000000000004', 'Como você vê o relacionamento da empresa com seus parceiros externos?', 0, 'scale', 'avaliacao', false, NULL),
('c0000000-0000-0000-0000-000000000004', 'E em sua opinião, qual a imagem que a JA tem no mercado?', 1, 'scale', 'avaliacao', false, NULL),
('c0000000-0000-0000-0000-000000000004', 'Como você considera a solução de problemas na JA?', 2, 'scale', 'avaliacao', true, 'Dê um exemplo recente:');

-- S5: Desenvolvimento e RH
-- Choice questions
INSERT INTO public.survey_questions (section_id, text, sort_order, question_type, scale_type, options, has_justification, justification_prompt) VALUES
('c0000000-0000-0000-0000-000000000005', 'Você considera o processo de contratação de pessoas eficaz?', 0, 'choice', NULL, '["Sim", "Não", "Em partes"]'::jsonb, true, 'O que poderia melhorar?'),
('c0000000-0000-0000-0000-000000000005', 'Você considera o processo de promoção interna adequado?', 1, 'choice', NULL, '["Sim", "Não", "Em partes"]'::jsonb, true, 'Explique sua resposta:'),
('c0000000-0000-0000-0000-000000000005', 'Você considera que os treinamentos (técnicos/comportamentais) têm frequência e conteúdos adequados?', 2, 'choice', NULL, '["Sim", "Não", "Em partes"]'::jsonb, true, 'O que falta ou deveria ser incluído?');
-- Scale questions
INSERT INTO public.survey_questions (section_id, text, sort_order, question_type, scale_type, has_justification, justification_prompt) VALUES
('c0000000-0000-0000-0000-000000000005', 'Você considera que sua remuneração (Fixo + Variável) e benefícios são justos para a mesma função?', 3, 'scale', 'concordancia', true, 'O que poderia ser revisto?'),
('c0000000-0000-0000-0000-000000000005', 'Você acredita que consegue manter equilíbrio entre vida profissional e pessoal?', 4, 'scale', 'frequencia', true, 'Algum exemplo ou situação?'),
('c0000000-0000-0000-0000-000000000005', 'Quando você precisa de apoio, sente que consegue pedir e ser ouvido(a)?', 5, 'scale', 'frequencia', true, 'Algum exemplo ou situação?');

-- S6: Cultura e Valores
-- Choice questions
INSERT INTO public.survey_questions (section_id, text, sort_order, question_type, scale_type, options, has_justification, justification_prompt) VALUES
('c0000000-0000-0000-0000-000000000006', 'Você se sente valorizado(a) pela sua empresa?', 0, 'choice', NULL, '["Sim", "Não", "Em partes"]'::jsonb, false, NULL),
('c0000000-0000-0000-0000-000000000006', 'Você se sente ouvido(a)?', 1, 'choice', NULL, '["Sim", "Não", "Em partes"]'::jsonb, false, NULL),
('c0000000-0000-0000-0000-000000000006', 'Você se orgulha de trabalhar na JA?', 3, 'choice', NULL, '["Sim", "Não", "Em partes"]'::jsonb, true, 'O que mais te orgulha?');
-- Scale question
INSERT INTO public.survey_questions (section_id, text, sort_order, question_type, scale_type, has_justification, justification_prompt) VALUES
('c0000000-0000-0000-0000-000000000006', 'Os colaboradores são tratados com respeito, independente da posição em que ocupam?', 2, 'scale', 'concordancia', true, 'Algum exemplo ou situação?');

-- S7: Encerramento (open text)
INSERT INTO public.survey_questions (section_id, text, sort_order, question_type, scale_type, has_justification, justification_prompt) VALUES
('c0000000-0000-0000-0000-000000000007', 'Quais as principais vantagens competitivas da JA em relação a outras instituições?', 0, 'open_text', NULL, false, NULL),
('c0000000-0000-0000-0000-000000000007', 'O que te motiva a trabalhar na JA?', 1, 'open_text', NULL, false, NULL),
('c0000000-0000-0000-0000-000000000007', 'Gostaria de acrescentar algo?', 2, 'open_text', NULL, false, NULL);
