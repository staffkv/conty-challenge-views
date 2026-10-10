import { describe, expect, it } from "vitest";
import { classify, type ClassificationResult } from "../src/classifier/index.ts";
import { formatPercent, formatTimes, formatViews } from "../src/classifier/format.ts";
import { EXAMPLES } from "../src/examples.ts";
import { FIXTURES, jumpAt, packageThenSettlesAt } from "./fixtures/series.ts";

const SERIES: Record<string, readonly number[]> = {
  ...Object.fromEntries(Object.entries(EXAMPLES).map(([name, example]) => [`exemplo ${name}`, example.views])),
  ...FIXTURES,
  "salto no limite": jumpAt(2_000),
  "pacote que não desliga": packageThenSettlesAt(726),
};

// Palavras de quem conhece o código, não de quem lê o resultado.
const JARGON = [/[a-z]+_[a-z]+/, /\bCV\b/, /mediana/i, /desvio/i, /√/, /limiar/i, /plat[oô]/i, /threshold/i, /sinal/i];

function signal(result: ClassificationResult, code: string) {
  return result.signals.find((item) => item.code === code)!;
}

describe("motivo legível sem conhecer o código", () => {
  for (const [name, views] of Object.entries(SERIES)) {
    it(`${name}: frases em português, sem jargão, com números`, () => {
      const result = classify(views);
      for (const pattern of JARGON) expect(result.reason).not.toMatch(pattern);
      expect(result.reason).toMatch(/\d/);
      expect(result.reason.split(". ").length).toBeGreaterThanOrEqual(2);
      if (result.event !== null) expect(result.reason).toContain("ª hora");
    });
  }
});

describe("os números do motivo são os mesmos dos sinais", () => {
  it("pacote comprado: horas do trecho, salto e volume acima do ritmo normal", () => {
    const result = classify(EXAMPLES.bought.views);
    const plateau = signal(result, "plato");
    expect(result.reason).toContain(`${plateau.start_hour}ª`);
    expect(result.reason).toContain(`${plateau.end_hour}ª hora`);
    expect(result.reason).toContain(`salto de ${formatTimes(signal(result, "salto").value!)} vezes`);
    expect(result.reason).toContain(`${formatViews(result.event!.excess_views!)} views acima`);
    expect(result.reason).toContain(`variação típica foi de ${formatViews(plateau.value!)}`);
  });

  it("rajada: hora e tamanho do pico", () => {
    const result = classify(EXAMPLES.burst.views);
    expect(result.reason).toContain(`Na ${result.event!.peak_hour}ª hora`);
    expect(result.reason).toContain(formatViews(result.event!.peak_views));
    expect(result.reason).toContain(`${formatTimes(signal(result, "salto").value!)} vezes`);
  });

  it("pico orgânico: quanto do pico continua nas horas seguintes", () => {
    const result = classify(EXAMPLES.organic.views);
    expect(result.reason).toContain(`${formatPercent(signal(result, "cauda").value!, 0)} do pico`);
  });
});

describe("texto dos motivos", () => {
  it("fica registrado para revisão humana", () => {
    const reasons = Object.fromEntries(Object.entries(SERIES).map(([name, views]) => [name, classify(views).reason]));
    expect(reasons).toMatchSnapshot();
  });
});
