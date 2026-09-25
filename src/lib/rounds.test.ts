import { describe, expect, it } from "vitest";
import { markCompleted, plan360, planClimate, roundKey, type Assignment, type Leader } from "./rounds";

/** A diretoria do IEE, como ela entra na matriz. */
const DIRETORIA = [
  "Alan Martins Elbling",
  "Amanda Cornélio Abbud",
  "Hugo de Oliveira Muller",
  "João da Costa Evangelista Tavares",
  "Pedro Ricco Deos",
  "Raul Kazanowski da Silva",
  "Stefano Wigner Tremea",
];

/** Todos avaliam todos, inclusive a si mesmos. */
const matrizDe = (quem: string): Assignment[] =>
  DIRETORIA.map((nome) => ({
    evaluatee_name: nome,
    evaluatee_role: `cargo de ${nome}`,
    is_self: nome === quem,
  }));

describe("plan360", () => {
  it("dá uma etapa por pessoa avaliada, com a autoavaliação por último", () => {
    const p = plan360("Hugo de Oliveira Muller", "Presidente", matrizDe("Hugo de Oliveira Muller"));
    expect(p.kind).toBe("rounds");
    if (p.kind !== "rounds") return;

    expect(p.rounds).toHaveLength(7);
    // Seis colegas, em ordem alfabética.
    expect(p.rounds.slice(0, 6).map((r) => r.leaderName)).toEqual(
      DIRETORIA.filter((n) => n !== "Hugo de Oliveira Muller"),
    );
    expect(p.rounds.slice(0, 6).every((r) => r.type === "leadership")).toBe(true);

    // A autoavaliação fecha.
    const last = p.rounds[6];
    expect(last.type).toBe("self");
    expect(last.leaderName).toBe("Hugo de Oliveira Muller");
  });

  it("monta as sete filas sem ninguém se avaliando como par", () => {
    for (const pessoa of DIRETORIA) {
      const p = plan360(pessoa, null, matrizDe(pessoa));
      if (p.kind !== "rounds") throw new Error(`fila vazia para ${pessoa}`);
      const pares = p.rounds.filter((r) => r.type === "leadership").map((r) => r.leaderName);
      expect(pares).toHaveLength(6);
      expect(pares).not.toContain(pessoa);
      expect(p.rounds.filter((r) => r.type === "self")).toHaveLength(1);
    }
  });

  it("carrega o cargo do avaliado, que vem da matriz e não do respondente", () => {
    const p = plan360("Pedro Ricco Deos", null, matrizDe("Pedro Ricco Deos"));
    if (p.kind !== "rounds") throw new Error();
    expect(p.rounds[0].role).toBe(`cargo de ${p.rounds[0].leaderName}`);
  });

  it("deduz a autoavaliação pelo nome quando a matriz não marcou", () => {
    // Atribuições gravadas antes da coluna `is_self` não têm a marca.
    const semMarca: Assignment[] = DIRETORIA.map((n) => ({ evaluatee_name: n }));
    const p = plan360("  amanda cornélio abbud  ", "Diretora", semMarca);
    if (p.kind !== "rounds") throw new Error();
    expect(p.rounds.filter((r) => r.type === "self")).toHaveLength(1);
    expect(p.rounds.filter((r) => r.type === "leadership")).toHaveLength(6);
  });

  it("não repete a mesma pessoa se a matriz vier duplicada", () => {
    const p = plan360("Ana", null, [
      { evaluatee_name: "Bruno" },
      { evaluatee_name: "bruno" },
      { evaluatee_name: "Ana", is_self: true },
    ]);
    if (p.kind !== "rounds") throw new Error();
    expect(p.rounds.filter((r) => r.type === "leadership")).toHaveLength(1);
  });

  it("funciona sem autoavaliação atribuída", () => {
    const p = plan360("Ana", null, [{ evaluatee_name: "Bruno" }, { evaluatee_name: "Carla" }]);
    if (p.kind !== "rounds") throw new Error();
    expect(p.rounds.map((r) => r.type)).toEqual(["leadership", "leadership"]);
  });

  it("não tem o que responder quando ninguém foi atribuído", () => {
    expect(plan360("Ana", null, []).kind).toBe("nothing");
  });

  it("recusa o link sem nome — não haveria como saber quem a pessoa avalia", () => {
    expect(plan360("   ", null, [{ evaluatee_name: "Bruno" }]).kind).toBe("invalid");
  });
});

describe("planClimate", () => {
  const leaders: Leader[] = [
    { name: "Carlos Souza", type: "company" },
    { name: "Ana Lima", type: "department" },
  ];

  it("liderança empresarial não responde", () => {
    expect(planClimate("Carlos Souza", leaders, true).kind).toBe("nothing");
  });

  it("líder de área responde sobre a empresa e avalia a liderança acima", () => {
    const p = planClimate("Ana Lima", leaders, true);
    if (p.kind !== "rounds") throw new Error();
    expect(p.rounds.map((r) => r.type)).toEqual(["org", "leadership"]);
    expect(p.rounds[1].leaderName).toBe("Carlos Souza");
    expect(p.needsDeptSelection).toBe(false);
  });

  it("colaborador começa pela organização e escolhe o líder depois", () => {
    const p = planClimate("João Silva", leaders, true);
    if (p.kind !== "rounds") throw new Error();
    expect(p.rounds.map((r) => r.type)).toEqual(["org"]);
    expect(p.needsDeptSelection).toBe(true);
  });

  it("sem líder de área, avalia direto a liderança empresarial", () => {
    const p = planClimate("João Silva", [{ name: "Carlos Souza", type: "company" }], true);
    if (p.kind !== "rounds") throw new Error();
    expect(p.rounds.map((r) => r.type)).toEqual(["org", "leadership"]);
    expect(p.needsDeptSelection).toBe(false);
  });

  it("sem perguntas de liderança, responde só sobre a organização", () => {
    const p = planClimate("João Silva", leaders, false);
    if (p.kind !== "rounds") throw new Error();
    expect(p.rounds.map((r) => r.type)).toEqual(["org"]);
  });

  it("link aberto, sem nome, cai no fluxo do colaborador", () => {
    const p = planClimate("", leaders, true);
    if (p.kind !== "rounds") throw new Error();
    expect(p.needsDeptSelection).toBe(true);
  });
});

describe("roundKey e markCompleted", () => {
  it("dá chave distinta para organização, autoavaliação e cada avaliado", () => {
    expect(roundKey({ leaderName: null, type: "org", completed: false })).toBe("org");
    expect(roundKey({ leaderName: "Ana", type: "self", completed: false })).toBe("self");
    expect(roundKey({ leaderName: "Ana", type: "leadership", completed: false })).toBe("leader:Ana");
  });

  it("a autoavaliação não colide com a etapa em que a pessoa é avaliada", () => {
    // Seria o caso se a chave saísse do nome nos dois: a pessoa avalia Ana e
    // Ana também se autoavalia. As duas etapas precisam ser distinguíveis.
    const self = roundKey({ leaderName: "Ana", type: "self", completed: false });
    const peer = roundKey({ leaderName: "Ana", type: "leadership", completed: false });
    expect(self).not.toBe(peer);
  });

  it("marca como concluída só a etapa já enviada", () => {
    const p = plan360("Ana", null, [
      { evaluatee_name: "Bruno" }, { evaluatee_name: "Carla" }, { evaluatee_name: "Ana", is_self: true },
    ]);
    if (p.kind !== "rounds") throw new Error();
    const marked = markCompleted(p.rounds, ["leader:Bruno"]);
    expect(marked.map((r) => r.completed)).toEqual([true, false, false]);
    // E a fila continua na próxima pendente, não do começo.
    expect(marked.findIndex((r) => !r.completed)).toBe(1);
  });
});
