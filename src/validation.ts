export const MAX_HOURS = 720;
export const MAX_VIEWS_PER_HOUR = 1_000_000_000;

export type ParseResult = { ok: true; views: number[] } | { ok: false; field: string; message: string };

function describe(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return `o texto ${JSON.stringify(value)}`;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return "uma lista";
  return typeof value === "object" ? "um objeto" : String(value);
}

// Contrato de entrada: { "views": [inteiros ≥ 0] }, uma posição por hora, em ordem.
export function parseClassifyRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, field: "body", message: "O corpo precisa ser um objeto JSON com o campo views." };
  }
  const unexpected = Object.keys(body).filter((key) => key !== "views");
  if (unexpected.length > 0) {
    return {
      ok: false,
      field: unexpected[0],
      message: `Campo não esperado: ${unexpected[0]}. O corpo aceita apenas views.`,
    };
  }
  const views = (body as { views?: unknown }).views;
  if (views === undefined) {
    return { ok: false, field: "views", message: "Campo obrigatório: views, a lista de views por hora." };
  }
  if (!Array.isArray(views)) {
    return { ok: false, field: "views", message: `views precisa ser uma lista de números; recebido: ${describe(views)}.` };
  }
  if (views.length === 0) {
    return { ok: false, field: "views", message: "views precisa ter pelo menos 1 hora." };
  }
  if (views.length > MAX_HOURS) {
    return {
      ok: false,
      field: "views",
      message: `views aceita no máximo ${MAX_HOURS} horas (30 dias); recebido: ${views.length}.`,
    };
  }
  for (let index = 0; index < views.length; index++) {
    const value: unknown = views[index];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_VIEWS_PER_HOUR) {
      return {
        ok: false,
        field: `views[${index}]`,
        message: `views[${index}] precisa ser um inteiro entre 0 e 1.000.000.000; recebido: ${describe(value)}.`,
      };
    }
  }
  return { ok: true, views: views.map((value: number) => value + 0) };
}
