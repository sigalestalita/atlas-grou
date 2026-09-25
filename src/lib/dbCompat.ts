/**
 * Ponte para quando o banco ainda não recebeu a migração mais nova.
 *
 * O PostgREST recusa a consulta INTEIRA quando ela cita uma coluna que não
 * existe — não devolve a consulta sem aquela coluna, devolve erro 42703 e nada
 * mais. Então uma tela que pede `submission_id` numa base sem a migração não
 * mostra "sem o campo novo": mostra "nenhuma resposta", como se a pesquisa
 * estivesse vazia.
 *
 * O Lovable aplica as migrações ao sincronizar, mas isso não é instantâneo, e o
 * intervalo entre publicar o código e a migração rodar é justamente quando o
 * painel fica sem dado. Aqui a primeira tentativa descobre o que falta, guarda
 * na memória do módulo e todas as consultas seguintes já saem sem essas
 * colunas. Quando a migração roda, um recarregamento volta a usá-las.
 *
 * As colunas em questão vêm da migração `20260922120000`.
 */

type PgError = { message: string } | null;

/**
 * O que o supabase-js devolve quando o `select` recebe uma string montada em
 * tempo de execução: ele não consegue inferir o formato da linha, então o tipo
 * do `data` vira inútil. Recebemos como `unknown` e afirmamos o tipo na saída,
 * que é onde quem chama sabe o que pediu.
 */
type RawResult = { data: unknown; error: PgError };
type Rows<T> = { data: T[] | null; error: PgError };

/** Colunas que este banco comprovadamente não tem. */
const absent = new Set<string>();

/** Erro do PostgREST para coluna inexistente sempre cita o nome dela. */
const NO_COLUMN = /does not exist|schema cache|42703/i;

export function isAbsent(column: string): boolean {
  return absent.has(column);
}

/** Lista de colunas do `select`, sem o que já sabemos faltar. */
export function columnList(base: string[], optional: string[]): string {
  return [...base, ...optional.filter((c) => !absent.has(c))].join(", ");
}

/** Qual das colunas opcionais o erro está culpando, se alguma. */
function blamed(error: PgError, optional: string[]): string | null {
  if (!error || !NO_COLUMN.test(error.message)) return null;
  return optional.find((c) => error.message.includes(c)) ?? null;
}

/**
 * Executa um `select` que menciona colunas opcionais.
 *
 * `run` recebe a lista de colunas pronta. Se o banco reclamar de uma delas, ela
 * é marcada como ausente e a consulta é refeita sem ela — quantas vezes forem
 * necessárias, uma por coluna.
 */
export async function selectCompat<T>(
  base: string[],
  optional: string[],
  run: (columns: string) => PromiseLike<RawResult>,
): Promise<Rows<T>> {
  // No pior caso, cada coluna opcional é recusada uma vez.
  for (let attempt = 0; attempt <= optional.length; attempt++) {
    const result = await run(columnList(base, optional));
    const culprit = blamed(result.error, optional);
    if (!culprit) return { data: result.data as T[] | null, error: result.error };
    absent.add(culprit);
  }
  const last = await run(columnList(base, optional));
  return { data: last.data as T[] | null, error: last.error };
}

/** Remove do payload as colunas que o banco não tem. */
export function stripAbsent<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!absent.has(key)) out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * Executa um `insert`/`update` cujo payload pode citar colunas opcionais.
 *
 * Mesma ideia do `selectCompat`: se o banco recusar por causa de uma coluna,
 * ela sai do payload e a escrita é refeita. O que sobra é gravado — melhor
 * gravar a resposta sem o campo novo do que perder a resposta.
 *
 * `dropped` diz o que ficou de fora. Quem chama precisa disso para não deixar a
 * gravação falhar em silêncio: sem esse aviso a tela mostra "salvo", o campo
 * reaparece preenchido enquanto a página não recarrega, e a pessoa só descobre
 * depois que o valor nunca chegou ao banco.
 */
export async function writeCompat<T extends Record<string, unknown>>(
  payload: T,
  optional: string[],
  run: (body: Partial<T>) => PromiseLike<{ error: PgError }>,
): Promise<{ error: PgError; dropped: string[] }> {
  const asked = Object.keys(payload).filter((k) => optional.includes(k));
  const dropped = () => asked.filter((k) => absent.has(k));

  for (let attempt = 0; attempt <= optional.length; attempt++) {
    const result = await run(stripAbsent(payload));
    const culprit = blamed(result.error, optional);
    if (!culprit) return { error: result.error, dropped: dropped() };
    absent.add(culprit);
  }
  const last = await run(stripAbsent(payload));
  return { error: last.error, dropped: dropped() };
}

/** Mesmo que `writeCompat`, para uma lista de linhas. */
export async function writeManyCompat<T extends Record<string, unknown>>(
  rows: T[],
  optional: string[],
  run: (body: Partial<T>[]) => PromiseLike<{ error: PgError }>,
): Promise<{ error: PgError; dropped: string[] }> {
  const asked = rows.length ? Object.keys(rows[0]).filter((k) => optional.includes(k)) : [];
  const dropped = () => asked.filter((k) => absent.has(k));

  for (let attempt = 0; attempt <= optional.length; attempt++) {
    const result = await run(rows.map((r) => stripAbsent(r)));
    const culprit = blamed(result.error, optional);
    if (!culprit) return { error: result.error, dropped: dropped() };
    absent.add(culprit);
  }
  const last = await run(rows.map((r) => stripAbsent(r)));
  return { error: last.error, dropped: dropped() };
}

/**
 * Colunas acrescentadas pelas migrações recentes, na ordem em que entraram.
 * `20260922120000` trouxe as de anonimato e prazo; `20260925100000`, as do 360.
 */
export const NEW_COLUMNS = {
  responses: ["submission_id", "respondent_id", "is_self"],
  respondents: ["started_at", "completed_rounds", "last_reminder_at", "reminder_count", "is_test"],
  surveys: ["opens_at", "closes_at", "wave_label", "survey_mode", "identified"],
  assignments: ["evaluatee_role", "is_self", "is_test"],
  userRoles: ["email"],
} as const;
