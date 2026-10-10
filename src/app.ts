import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { classify, RULES } from "./classifier/index.ts";
import { parseClassifyRequest } from "./validation.ts";

export const MAX_BODY_BYTES = 64 * 1024;

export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", rules_version: RULES.version }));

app.post(
  "/v1/classify",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      c.json({ error: "corpo_muito_grande", message: "O corpo da requisição passa de 64 KiB." }, 413),
  }),
  async (c) => {
    let body: unknown;
    try {
      body = JSON.parse(await c.req.text());
    } catch {
      return c.json({ error: "json_invalido", message: "O corpo não é um JSON válido." }, 400);
    }
    const parsed = parseClassifyRequest(body);
    if (!parsed.ok) {
      return c.json({ error: "entrada_invalida", field: parsed.field, message: parsed.message }, 400);
    }
    return c.json(classify(parsed.views));
  },
);

app.notFound((c) => c.json({ error: "rota_inexistente", message: "Use POST /v1/classify ou GET /health." }, 404));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "erro_interno", message: "Erro inesperado ao classificar a série." }, 500);
});
