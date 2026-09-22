import { describe, expect, it } from "vitest";
import {
  MIN_GROUP, computeEnps, consensus, countPeople, distribution,
  groupByWithPrivacy, scoreFromAverage, submissionKey, truncate,
  type ResponseRow,
} from "./climate";

/**
 * Cobre exatamente os erros de cálculo que estavam em produção. Cada bloco
 * abaixo tem um `it` que falha na implementação antiga.
 */

/** Monta uma linha de resposta com o mínimo necessário para o teste. */
function row(over: Partial<ResponseRow> & { value: number }): ResponseRow {
  return {
    question_id: "q1",
    department: null,
    company_leadership: null,
    department_leadership: null,
    evaluated_leader: null,
    submitted_at: "2026-09-01T10:00:00.000Z",
    submission_id: null,
    ...over,
  };
}

/** Uma pessoa respondendo `n` perguntas — todas com o mesmo submission_id. */
function person(id: string, values: number[], over: Partial<ResponseRow> = {}): ResponseRow[] {
  return values.map((value, i) =>
    row({ ...over, value, question_id: `q${i}`, submission_id: id }));
}

describe("submissionKey", () => {
  it("usa submission_id quando ele existe", () => {
    expect(submissionKey(row({ value: 3, submission_id: "abc" }))).toBe("abc");
  });

  it("cai no par (instante, líder) nas respostas anteriores à migração", () => {
    const a = row({ value: 3, submitted_at: "2026-09-01T10:00:00Z", evaluated_leader: "Ana" });
    const b = row({ value: 5, submitted_at: "2026-09-01T10:00:00Z", evaluated_leader: "Ana" });
    const c = row({ value: 5, submitted_at: "2026-09-01T10:00:00Z", evaluated_leader: "Bruno" });
    expect(submissionKey(a)).toBe(submissionKey(b));
    expect(submissionKey(a)).not.toBe(submissionKey(c));
  });
});

describe("countPeople", () => {
  it("conta pessoas, não linhas de resposta", () => {
    // Uma pessoa respondendo 10 perguntas continua sendo uma pessoa.
    const rows = person("p1", [1, 2, 3, 4, 5, 4, 3, 2, 1, 5]);
    expect(rows).toHaveLength(10);
    expect(countPeople(rows)).toBe(1);
  });
});

describe("scoreFromAverage", () => {
  it("leva o mínimo da escala em conta", () => {
    // Numa escala de 1 a 5, a pior nota possível é 0, não 20.
    expect(scoreFromAverage(1, 1, 5)).toBe(0);
    expect(scoreFromAverage(3, 1, 5)).toBe(50);
    expect(scoreFromAverage(5, 1, 5)).toBe(100);
  });

  it("funciona em escalas que começam no zero", () => {
    expect(scoreFromAverage(0, 0, 10)).toBe(0);
    expect(scoreFromAverage(10, 0, 10)).toBe(100);
  });
});

describe("groupByWithPrivacy", () => {
  it("esconde o grupo com menos de três PESSOAS, mesmo com muitas linhas", () => {
    // O bug antigo: uma pessoa com 10 respostas passava pelo mínimo de 3.
    const rows = person("p1", [5, 5, 5, 5, 5, 5, 5, 5, 5, 5], { department: "Jurídico" });
    const { groups, suppressed, suppressedNames } = groupByWithPrivacy(rows, (r) => r.department, 1, 5);
    expect(groups).toHaveLength(0);
    expect(suppressed).toBe(1);
    expect(suppressedNames).toEqual(["Jurídico"]);
  });

  it("mostra o grupo a partir de três pessoas", () => {
    const rows = [
      ...person("p1", [4, 4], { department: "TI" }),
      ...person("p2", [2, 2], { department: "TI" }),
      ...person("p3", [3, 3], { department: "TI" }),
    ];
    const { groups, suppressed } = groupByWithPrivacy(rows, (r) => r.department, 1, 5);
    expect(suppressed).toBe(0);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: "TI", people: 3, answers: 6, avg: 3 });
  });

  it("ordena da maior para a menor média", () => {
    const mk = (dept: string, v: number) =>
      [1, 2, 3].flatMap((n) => person(`${dept}${n}`, [v], { department: dept }));
    const { groups } = groupByWithPrivacy([...mk("Baixa", 2), ...mk("Alta", 5)], (r) => r.department, 1, 5);
    expect(groups.map((g) => g.name)).toEqual(["Alta", "Baixa"]);
  });

  it("MIN_GROUP é três", () => {
    expect(MIN_GROUP).toBe(3);
  });
});

describe("computeEnps", () => {
  it("é promotores menos detratores, não média", () => {
    // Média destas notas é 6,4 — um número que não diz nada sobre eNPS.
    const e = computeEnps([10, 10, 9, 0, 3, 6, 8, 7, 9, 2])!;
    expect(e.promoters).toBe(4);   // 10, 10, 9, 9
    expect(e.passives).toBe(2);    // 8, 7
    expect(e.detractors).toBe(4);  // 0, 3, 6, 2
    expect(e.score).toBe(0);       // 40% − 40%
  });

  it("vai de -100 a 100", () => {
    expect(computeEnps([10, 9, 10])!.score).toBe(100);
    expect(computeEnps([0, 6, 3])!.score).toBe(-100);
  });

  it("devolve nulo sem nota válida", () => {
    expect(computeEnps([])).toBeNull();
    expect(computeEnps([11, -2])).toBeNull();
  });
});

describe("consensus", () => {
  it("separa 'todo mundo achou regular' de 'metade amou, metade odiou'", () => {
    const morno = consensus([3, 3, 3, 3], 1, 5);
    const partido = consensus([1, 5, 1, 5], 1, 5);
    // As duas têm média 3, mas só uma é um acordo.
    expect(morno).toBe(100);
    expect(partido).toBe(0);
    expect(morno).toBeGreaterThan(partido);
  });

  it("uma resposta só é acordo por definição", () => {
    expect(consensus([4], 1, 5)).toBe(100);
  });
});

describe("distribution", () => {
  it("tem uma casa por nota da escala, inclusive as zeradas", () => {
    expect(distribution([1, 1, 3, 5], 1, 5)).toEqual([2, 0, 1, 0, 1]);
  });

  it("ignora nota fora da escala", () => {
    expect(distribution([0, 3, 9], 1, 5)).toEqual([0, 0, 1, 0, 0]);
  });
});

describe("truncate", () => {
  it("não parte palavra no meio", () => {
    expect(truncate("comunicação interna da empresa", 20)).toBe("comunicação interna…");
  });

  it("deixa em paz o texto que já cabe", () => {
    expect(truncate("curto", 20)).toBe("curto");
  });
});
