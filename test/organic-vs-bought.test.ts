import { describe, expect, it } from "vitest";
import { classify, type ClassificationResult, type SignalCode } from "../src/classifier/index.ts";
import { EXAMPLES, natural } from "../src/examples.ts";

// As duas séries do README: mesmo pico, quase o mesmo volume extra, desenhos diferentes.
const organic = EXAMPLES.organic.views;
const bought = EXAMPLES.bought.views;

function signal(result: ClassificationResult, code: SignalCode) {
  const found = result.signals.find((item) => item.code === code);
  if (!found) throw new Error(`sinal ${code} ausente`);
  return found;
}

function extraViews(views: readonly number[], base: number): number {
  const normal = natural(base, views.length);
  return views.reduce((sum, value, hour) => sum + (value - normal[hour]), 0);
}

describe("pico orgânico e pico comprado de mesmo tamanho", () => {
  it("têm o mesmo pico e quase o mesmo volume acima do ritmo normal", () => {
    const organicPeak = Math.max(...organic);
    const boughtPeak = Math.max(...bought);
    expect(Math.abs(organicPeak - boughtPeak) / boughtPeak).toBeLessThan(0.05);

    const organicExtra = extraViews(organic, 250);
    const boughtExtra = extraViews(bought, 250);
    expect(Math.abs(organicExtra - boughtExtra) / boughtExtra).toBeLessThan(0.1);
  });

  it("caem em baldes diferentes: orgânico sem indícios, comprado suspeito", () => {
    expect(classify(organic).classification).toBe("sem_indicios");
    expect(classify(bought).classification).toBe("suspeito");
  });

  it("os dois saltam; o que muda é o trecho fixo, o desligamento e a cauda", () => {
    const organicResult = classify(organic);
    const boughtResult = classify(bought);

    expect(signal(organicResult, "salto").active).toBe(true);
    expect(signal(boughtResult, "salto").active).toBe(true);

    expect(signal(organicResult, "plato").active).toBe(false);
    expect(signal(boughtResult, "plato").active).toBe(true);

    expect(signal(organicResult, "queda").active).toBe(false);
    expect(signal(boughtResult, "queda").active).toBe(true);

    expect(signal(organicResult, "cauda").active).toBe(true);
    expect(signal(boughtResult, "cauda").active).toBe(false);
  });

  it("o motivo do comprado cita o trecho fixo e o volume acima do ritmo normal", () => {
    const result = classify(bought);
    expect(result.reason).toContain("praticamente fixas");
    expect(result.reason).toContain("merece revisão");
    expect(result.event?.excess_views).toBeGreaterThan(35_000);
  });

  it("o motivo do orgânico diz que a queda foi gradual e não afirma que as views são humanas", () => {
    const reason = classify(organic).reason;
    expect(reason).toContain("queda foi gradual");
    expect(reason).toContain("não prova que as views são humanas");
  });
});
