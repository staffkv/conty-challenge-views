import { describe, expect, it } from "vitest";
import { app } from "../src/app.ts";
import { RULES } from "../src/classifier/index.ts";
import { EXAMPLES } from "../src/examples.ts";

function post(body: string) {
  return app.request("/v1/classify", { method: "POST", headers: { "content-type": "application/json" }, body });
}

describe("GET /health", () => {
  it("responde com a versão das regras", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", rules_version: RULES.version });
  });
});

describe("POST /v1/classify", () => {
  it("classifica uma série e devolve classificação, motivo, evento e sinais", async () => {
    const response = await post(JSON.stringify({ views: EXAMPLES.bought.views }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ classification: "suspeito", rules_version: RULES.version });
    expect(typeof body.reason).toBe("string");
    expect(body.event).toMatchObject({ start_hour: 31, end_hour: 38 });
    expect(body.signals).toHaveLength(6);
  });

  it("série curta é válida: 200 e inconclusivo", async () => {
    const response = await post(JSON.stringify({ views: [120, 98, 131, 110, 125, 104] }));
    expect(response.status).toBe(200);
    expect((await response.json()).classification).toBe("inconclusivo");
  });

  it("JSON malformado: 400", async () => {
    const response = await post("{ views: [1, 2");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "json_invalido" });
  });

  const invalid: [string, unknown, string][] = [
    ["corpo que não é objeto", [1, 2, 3], "body"],
    ["campo extra", { views: [1], creator: "x" }, "creator"],
    ["sem views", {}, "views"],
    ["views que não é lista", { views: "1,2,3" }, "views"],
    ["lista vazia", { views: [] }, "views"],
    ["mais de 720 horas", { views: Array(721).fill(1) }, "views"],
    ["número negativo", { views: [1, -1] }, "views[1]"],
    ["fração", { views: [1, 2.5] }, "views[1]"],
    ["texto", { views: [1, "2"] }, "views[1]"],
    ["null", { views: [null] }, "views[0]"],
    ["acima de 1 bilhão", { views: [1_000_000_001] }, "views[0]"],
  ];
  for (const [name, body, field] of invalid) {
    it(`${name}: 400 indicando o campo ${field}`, async () => {
      const response = await post(JSON.stringify(body));
      expect(response.status).toBe(400);
      const payload = await response.json();
      expect(payload).toMatchObject({ error: "entrada_invalida", field });
      expect(payload.message).toContain(field === "body" ? "objeto JSON" : field.split("[")[0]);
    });
  }

  it("corpo acima de 64 KiB: 413", async () => {
    const response = await post(JSON.stringify({ views: Array(700).fill(1) }) + " ".repeat(70 * 1024));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "corpo_muito_grande" });
  });
});

describe("rota inexistente", () => {
  it("404 com JSON", async () => {
    const response = await app.request("/v1/outra");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "rota_inexistente" });
  });
});
