import { describe, expect, it } from "vitest";
import { classify } from "../src/classifier/index.ts";
import { EXAMPLES } from "../src/examples.ts";
import { FIXTURES } from "./fixtures/series.ts";

describe("casos em que o classificador prefere não acusar", () => {
  it("rajada de uma hora que volta ao ritmo de antes (o caso do README)", () => {
    const result = classify(EXAMPLES.burst.views);
    expect(result.classification).toBe("inconclusivo");
    expect(result.reason).toContain("Na 40ª hora");
    expect(result.reason).toContain("não há evidência suficiente para acusar");
    expect(result.signals.find((signal) => signal.code === "salto")?.active).toBe(true);
    expect(result.signals.find((signal) => signal.code === "queda")?.active).toBe(true);
    expect(result.signals.find((signal) => signal.code === "plato")?.active).toBe(false);
  });

  it("série com menos de 24 horas", () => {
    const result = classify(FIXTURES.short);
    expect(result.classification).toBe("inconclusivo");
    expect(result.signals.find((signal) => signal.code === "serie_curta")?.active).toBe(true);
    expect(result.reason).toContain("12 horas");
  });

  it("pico na última hora: não inventa uma queda que não foi observada", () => {
    const result = classify(FIXTURES.peakAtLastHour);
    expect(result.classification).toBe("inconclusivo");
    const drop = result.signals.find((signal) => signal.code === "queda");
    expect(drop?.active).toBe(false);
    expect(drop?.value).toBeNull();
    expect(result.reason).toContain("a série termina");
  });

  it("compra no lançamento: trecho fixo sem ritmo anterior para comparar", () => {
    const result = classify(FIXTURES.launchPurchase);
    expect(result.classification).toBe("inconclusivo");
    expect(result.signals.find((signal) => signal.code === "salto")?.value).toBeNull();
    expect(result.signals.find((signal) => signal.code === "plato")?.active).toBe(true);
    expect(result.reason).toContain("não há ritmo anterior para comparar");
  });

  it("pulsos com zero exato entre eles, como um contador atualizado em lotes", () => {
    const result = classify(FIXTURES.pulsesOnEmptyChannel);
    expect(result.classification).toBe("inconclusivo");
    expect(result.signals.find((signal) => signal.code === "repeticao")?.active).toBe(true);
    expect(result.reason).toContain("atualiza o contador");
  });
});
