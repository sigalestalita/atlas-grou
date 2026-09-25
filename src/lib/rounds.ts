/**
 * Quais etapas cada pessoa responde, e em que ordem.
 *
 * Esta era a parte mais delicada da pesquisa e vivia no meio do componente, sem
 * teste: montar errado significa alguém avaliando quem não devia, ou não sendo
 * avaliado por ninguém — e numa rodada com gente de verdade isso só aparece
 * depois que os links já foram enviados. Aqui é uma função pura.
 */

export interface Round {
  /** Quem está sendo avaliado. `null` na etapa sobre a organização. */
  leaderName: string | null;
  /**
   * `org` fala da empresa; `leadership` avalia outra pessoa; `self` é a
   * autoavaliação, que tem enunciado próprio, na primeira pessoa.
   */
  type: "org" | "leadership" | "self";
  /** Cargo de quem está sendo avaliado, quando conhecido. */
  role?: string | null;
  completed: boolean;
}

export interface Leader {
  name: string;
  type: "company" | "department";
  hidden?: boolean;
}

export interface Assignment {
  evaluatee_name: string;
  evaluatee_role?: string | null;
  is_self?: boolean;
}

/** Identifica uma etapa de forma estável, para saber o que já foi enviado. */
export const roundKey = (r: Round): string =>
  r.type === "org" ? "org" : r.type === "self" ? "self" : `leader:${r.leaderName}`;

/** Compara nomes ignorando caixa e espaço em volta. */
export const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export type Plan =
  | { kind: "rounds"; rounds: Round[]; needsDeptSelection: boolean }
  /** A pessoa está na pesquisa, mas não tem nada a responder. */
  | { kind: "nothing" }
  /** Falta informação para montar — link inutilizável. */
  | { kind: "invalid" };

/**
 * Etapas de uma rodada 360, a partir da matriz de quem avalia quem.
 *
 * A autoavaliação fica por último de propósito: é mais fácil se avaliar depois
 * de ter pensado sobre o trabalho de todo mundo, e a nota que a pessoa dá a si
 * mesma tende a ficar mais calibrada quando ela acabou de usar a mesma escala
 * sete vezes.
 */
export function plan360(
  myName: string,
  myRole: string | null,
  assignments: Assignment[],
): Plan {
  const name = myName.trim();
  if (!name) return { kind: "invalid" };
  if (!assignments.length) return { kind: "nothing" };

  const isSelf = (a: Assignment) => a.is_self ?? sameName(a.evaluatee_name, name);

  // Uma pessoa não deve aparecer duas vezes na fila, nem que a matriz repita.
  const seen = new Set<string>();
  const peers = assignments
    .filter((a) => !isSelf(a))
    .filter((a) => {
      const k = a.evaluatee_name.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.evaluatee_name.localeCompare(b.evaluatee_name, "pt-BR"));

  const self = assignments.find(isSelf);

  const rounds: Round[] = [
    ...peers.map((a) => ({
      leaderName: a.evaluatee_name,
      role: a.evaluatee_role ?? null,
      type: "leadership" as const,
      completed: false,
    })),
    ...(self
      ? [{
          leaderName: name,
          role: self.evaluatee_role ?? myRole ?? null,
          type: "self" as const,
          completed: false,
        }]
      : []),
  ];

  if (!rounds.length) return { kind: "nothing" };
  return { kind: "rounds", rounds, needsDeptSelection: false };
}

/**
 * Etapas de uma pesquisa de clima.
 *
 * Quem é liderança empresarial não responde: não se autoavalia nem avalia par.
 * Quem lidera uma área responde sobre a organização e avalia a liderança acima.
 * Os demais respondem sobre a organização e escolhem o líder de área que vão
 * avaliar — a escolha só aparece depois, então a fila começa com uma etapa só.
 */
export function planClimate(
  myName: string,
  leaders: Leader[],
  hasLeadershipQuestions: boolean,
): Plan {
  const name = myName.trim();
  const companyLeaders = leaders.filter((l) => l.type === "company");
  const deptLeaders = leaders.filter((l) => l.type === "department");

  const org: Round = { leaderName: null, type: "org", completed: false };
  const evaluate = (l: Leader): Round => ({
    leaderName: l.name, type: "leadership", completed: false,
  });

  if (name && companyLeaders.some((l) => sameName(l.name, name))) {
    return { kind: "nothing" };
  }

  if (name && deptLeaders.some((l) => sameName(l.name, name))) {
    return { kind: "rounds", rounds: [org, ...companyLeaders.map(evaluate)], needsDeptSelection: false };
  }

  if (deptLeaders.length > 0 && hasLeadershipQuestions) {
    return { kind: "rounds", rounds: [org], needsDeptSelection: true };
  }

  if (hasLeadershipQuestions && companyLeaders.length > 0) {
    return { kind: "rounds", rounds: [org, ...companyLeaders.map(evaluate)], needsDeptSelection: false };
  }

  return { kind: "rounds", rounds: [org], needsDeptSelection: false };
}

/**
 * Marca como concluídas as etapas que já foram enviadas.
 *
 * O que veio do servidor manda; o rascunho local só acrescenta. Sem isso, quem
 * retomasse de outro aparelho refazia etapas já gravadas — e o mesmo voto
 * entrava duas vezes na apuração.
 */
export function markCompleted(rounds: Round[], done: Iterable<string>): Round[] {
  const set = new Set(done);
  return rounds.map((r) => ({ ...r, completed: set.has(roundKey(r)) }));
}
