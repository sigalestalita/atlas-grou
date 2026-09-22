import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O conjunto de colunas ausentes é um cache de módulo — é justamente o que faz
 * a descoberta valer para as consultas seguintes. Por isso cada teste começa
 * com o módulo zerado, senão um herdaria a descoberta do outro.
 */
beforeEach(() => vi.resetModules());

const fresh = () => import("./dbCompat");

/** Erro que o PostgREST devolve quando a coluna não existe. */
const noColumn = (col: string, table = "survey_responses") => ({
  message: `column ${table}.${col} does not exist`,
});

/** Erro do cache de schema — a outra forma que o PostgREST usa. */
const notInCache = (col: string, table = "surveys") => ({
  message: `Could not find the '${col}' column of '${table}' in the schema cache`,
});

describe("selectCompat", () => {
  it("passa direto quando o banco tem todas as colunas", async () => {
    const { selectCompat } = await fresh();
    const seen: string[] = [];
    const res = await selectCompat<{ id: string }>(["id", "value"], ["submission_id"], (cols) => {
      seen.push(cols);
      return Promise.resolve({ data: [{ id: "a" }], error: null });
    });
    expect(seen).toEqual(["id, value, submission_id"]);
    expect(res.data).toEqual([{ id: "a" }]);
  });

  it("refaz a consulta sem a coluna que o banco recusou", async () => {
    const { selectCompat } = await fresh();
    const seen: string[] = [];
    const res = await selectCompat<{ id: string }>(["id", "value"], ["submission_id"], (cols) => {
      seen.push(cols);
      return Promise.resolve(
        cols.includes("submission_id")
          ? { data: null, error: noColumn("submission_id") }
          : { data: [{ id: "a" }], error: null },
      );
    });
    expect(seen).toEqual(["id, value, submission_id", "id, value"]);
    // O ponto do exercício: a tela recebe os dados em vez de uma lista vazia.
    expect(res.error).toBeNull();
    expect(res.data).toEqual([{ id: "a" }]);
  });

  it("entende também a mensagem de cache de schema", async () => {
    const { selectCompat } = await fresh();
    const res = await selectCompat<{ id: string }>(["id"], ["wave_label"], (cols) =>
      Promise.resolve(
        cols.includes("wave_label")
          ? { data: null, error: notInCache("wave_label") }
          : { data: [{ id: "a" }], error: null },
      ));
    expect(res.data).toEqual([{ id: "a" }]);
  });

  it("descarta várias colunas ausentes, uma por tentativa", async () => {
    const { selectCompat } = await fresh();
    const res = await selectCompat<{ id: string }>(["id"], ["started_at", "completed_rounds"], (cols) => {
      if (cols.includes("started_at")) return Promise.resolve({ data: null, error: noColumn("started_at") });
      if (cols.includes("completed_rounds")) return Promise.resolve({ data: null, error: noColumn("completed_rounds") });
      return Promise.resolve({ data: [{ id: "a" }], error: null });
    });
    expect(res.data).toEqual([{ id: "a" }]);
  });

  it("lembra o que faltou e não tenta de novo na consulta seguinte", async () => {
    const { selectCompat } = await fresh();
    const run = (cols: string) =>
      Promise.resolve(
        cols.includes("submission_id")
          ? { data: null, error: noColumn("submission_id") }
          : { data: [], error: null },
      );
    await selectCompat(["id"], ["submission_id"], run);

    const seen: string[] = [];
    await selectCompat(["id"], ["submission_id"], (cols) => {
      seen.push(cols);
      return run(cols);
    });
    expect(seen).toEqual(["id"]);
  });

  it("devolve o erro quando ele não é de coluna ausente", async () => {
    const { selectCompat } = await fresh();
    const res = await selectCompat(["id"], ["submission_id"], () =>
      Promise.resolve({ data: null, error: { message: "permission denied for table" } }));
    expect(res.error?.message).toMatch(/permission denied/);
  });
});

describe("writeCompat", () => {
  it("grava o que o banco aceita e diz o que ficou de fora", async () => {
    const { writeCompat } = await fresh();
    const bodies: Record<string, unknown>[] = [];
    const { error, dropped } = await writeCompat(
      { status: "responded", completed_rounds: ["org"] },
      ["completed_rounds"],
      (body) => {
        bodies.push(body);
        return Promise.resolve(
          "completed_rounds" in body
            ? { error: noColumn("completed_rounds", "respondents") }
            : { error: null },
        );
      },
    );
    expect(error).toBeNull();
    // Marcar "respondeu" é o que não pode faltar; o campo novo é acessório.
    expect(bodies.at(-1)).toEqual({ status: "responded" });
    // E quem chamou precisa saber, para não anunciar "salvo" ao usuário.
    expect(dropped).toEqual(["completed_rounds"]);
  });

  it("não relata descarte quando o banco aceitou tudo", async () => {
    const { writeCompat } = await fresh();
    const { dropped } = await writeCompat(
      { wave_label: "2026.1" }, ["wave_label"], () => Promise.resolve({ error: null }));
    expect(dropped).toEqual([]);
  });
});

describe("writeManyCompat", () => {
  it("reenvia as linhas sem a coluna ausente em vez de perder a resposta", async () => {
    const { writeManyCompat } = await fresh();
    const attempts: unknown[][] = [];
    const rows = [
      { question_id: "q1", value: 4, submission_id: "s1" },
      { question_id: "q2", value: 5, submission_id: "s1" },
    ];
    const { error } = await writeManyCompat(rows, ["submission_id"], (body) => {
      attempts.push(body);
      return Promise.resolve(
        body.some((r) => "submission_id" in r)
          ? { error: noColumn("submission_id") }
          : { error: null },
      );
    });
    expect(error).toBeNull();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual([
      { question_id: "q1", value: 4 },
      { question_id: "q2", value: 5 },
    ]);
  });
});
