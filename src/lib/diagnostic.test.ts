import { describe, expect, it } from "vitest";
import {
  dimensionScores, formatPhone, itemBand, levelFor, priorities, RECOMMENDATIONS,
  scoreFor, strengths, validateLead, type DiagnosticQuestion,
} from "./diagnostic";

const QUESTIONS: DiagnosticQuestion[] = [
  { key: "q1", text: "Clareza do que se espera", dimension: "clareza" },
  { key: "q2", text: "Competências dos melhores", dimension: "clareza" },
  { key: "q3", text: "Potencial antes de promover", dimension: "potencial" },
  { key: "q4", text: "Adaptar a gestão", dimension: "pratica" },
  { key: "q5", text: "Rotina de feedback", dimension: "pratica" },
  { key: "q6", text: "Sucessores", dimension: "potencial" },
  { key: "q7", text: "Evidência", dimension: "evidencias" },
  { key: "q8", text: "Indicadores", dimension: "evidencias" },
];

describe("scoreFor", () => {
  it("vai de 0 a 100 numa escala de 0 a 5", () => {
    expect(scoreFor([0, 0, 0, 0, 0, 0, 0, 0], 0, 5)).toBe(0);
    expect(scoreFor([5, 5, 5, 5, 5, 5, 5, 5], 0, 5)).toBe(100);
    // 20 de 40 pontos
    expect(scoreFor([2, 3, 2, 3, 2, 3, 2, 3], 0, 5)).toBe(50);
  });

  it("arredonda como o banco (round de numeric)", () => {
    // 21 de 40 = 52,5 → 53
    expect(scoreFor([3, 3, 3, 3, 3, 2, 2, 2], 0, 5)).toBe(53);
  });

  it("considera o mínimo da escala", () => {
    expect(scoreFor([1, 1], 1, 5)).toBe(0);
    expect(scoreFor([3, 3], 1, 5)).toBe(50);
  });
});

describe("levelFor", () => {
  // As mesmas fronteiras de diagnostic_level() na migração 20261001120000.
  it.each([
    [0, "inicial"], [20, "inicial"],
    [21, "reativa"], [40, "reativa"],
    [41, "em_estruturacao"], [60, "em_estruturacao"],
    [61, "estruturada"], [80, "estruturada"],
    [81, "estrategica"], [100, "estrategica"],
  ])("%i → %s", (score, key) => {
    expect(levelFor(score).key).toBe(key);
  });
});

describe("itemBand", () => {
  it("0–1 ausente, 2–3 em desenvolvimento, 4–5 consolidado", () => {
    expect([0, 1].map((v) => itemBand(v).band)).toEqual(["critico", "critico"]);
    expect([2, 3].map((v) => itemBand(v).band)).toEqual(["desenvolvimento", "desenvolvimento"]);
    expect([4, 5].map((v) => itemBand(v).band)).toEqual(["forte", "forte"]);
  });
});

describe("dimensionScores", () => {
  it("agrupa duas afirmações por pilar, na ordem do radar", () => {
    const answers = { q1: 5, q2: 5, q3: 0, q6: 0, q4: 3, q5: 2, q7: 1, q8: 1 };
    const d = dimensionScores(QUESTIONS, answers, 0, 5);
    expect(d.map((x) => [x.key, x.score])).toEqual([
      ["clareza", 100], ["potencial", 0], ["pratica", 50], ["evidencias", 20],
    ]);
  });
});

describe("strengths e priorities", () => {
  const answers = { q1: 5, q2: 4, q3: 1, q4: 4, q5: 3, q6: 0, q7: 1, q8: 2 };

  it("força é nota a partir de 4, maior primeiro, empate na ordem", () => {
    expect(strengths(QUESTIONS, answers).map((r) => r.key)).toEqual(["q1", "q2", "q4"]);
  });

  it("prioridade é nota até 3, menor primeiro, empate na ordem", () => {
    expect(priorities(QUESTIONS, answers).map((r) => r.key)).toEqual(["q6", "q3", "q7"]);
  });

  it("tudo alto não gera prioridade; tudo baixo não gera força", () => {
    const high = Object.fromEntries(QUESTIONS.map((q) => [q.key, 5]));
    const low = Object.fromEntries(QUESTIONS.map((q) => [q.key, 0]));
    expect(priorities(QUESTIONS, high)).toEqual([]);
    expect(strengths(QUESTIONS, low)).toEqual([]);
  });

  it("toda pergunta tem recomendação", () => {
    for (const q of QUESTIONS) expect(RECOMMENDATIONS[q.key]).toBeTruthy();
  });
});

describe("validateLead", () => {
  const ok = { name: "Ana Souza", email: "ana@empresa.com.br", phone: "(51) 99999-0000", company: "Empresa X" };

  it("aceita um cadastro completo", () => {
    expect(validateLead(ok)).toEqual({});
  });

  it("recusa telefone sem DDD e e-mail sem domínio", () => {
    const e = validateLead({ ...ok, phone: "99999-0000", email: "ana@" });
    expect(e.phone).toBeTruthy();
    expect(e.email).toBeTruthy();
  });
});

describe("formatPhone", () => {
  it("formata celular e fixo enquanto se digita", () => {
    expect(formatPhone("51999990000")).toBe("(51) 99999-0000");
    expect(formatPhone("5133330000")).toBe("(51) 3333-0000");
    expect(formatPhone("519")).toBe("(51) 9");
  });
});
