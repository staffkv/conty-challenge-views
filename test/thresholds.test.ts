import { describe, expect, it } from "vitest";
import { classify, RULES } from "../src/classifier/index.ts";
import { jumpAt, packageThenSettlesAt, plateauWithSwing } from "./fixtures/series.ts";

// Comparações inclusivas: no limite exato o sinal ativa; um passo além, não.
// O ritmo anterior dessas séries é exatamente 250 views/h.

function signal(views: readonly number[], code: string) {
  return classify(views).signals.find((item) => item.code === code)!;
}

describe("salto: pico ≥ 8 × o ritmo anterior", () => {
  it("2.000 views sobre 250 por hora (exatamente 8 vezes) ativa", () => {
    expect(RULES.jump.minRatio).toBe(8);
    const jump = signal(jumpAt(2_000), "salto");
    expect(jump.value).toBe(8);
    expect(jump.active).toBe(true);
  });

  it("1.999 views (7,996 vezes) não ativa", () => {
    const jump = signal(jumpAt(1_999), "salto");
    expect(jump.value).toBeCloseTo(7.996, 3);
    expect(jump.active).toBe(false);
    expect(classify(jumpAt(1_999)).classification).toBe("sem_indicios");
  });
});

describe("trecho fixo: variação típica ≤ 0,5 × √média", () => {
  // Média exata de 10.000 views/h: o limite é 0,5 × 100 = 50 views de uma hora para a outra.
  it("variação de 50 views ativa e, com salto e desligamento, a série é suspeita", () => {
    const plateau = signal(plateauWithSwing(25), "plato");
    expect(plateau.threshold).toBe(50);
    expect(plateau.value).toBe(50);
    expect(plateau.active).toBe(true);
    expect(classify(plateauWithSwing(25)).classification).toBe("suspeito");
  });

  it("variação de 52 views não ativa, e o mesmo desenho vira inconclusivo", () => {
    const plateau = signal(plateauWithSwing(26), "plato");
    expect(plateau.value).toBe(52);
    expect(plateau.active).toBe(false);
    expect(classify(plateauWithSwing(26)).classification).toBe("inconclusivo");
  });
});

describe("volta brusca: no máximo 10% do excesso sobre o ritmo anterior", () => {
  // Trecho fixo em 5.000, ritmo anterior de 250: 10% do excesso deixa o limite em 725 views/h.
  it("voltar a 725 por hora ativa", () => {
    const drop = signal(packageThenSettlesAt(725), "queda");
    expect(drop.value).toBe(0.1);
    expect(drop.active).toBe(true);
    expect(classify(packageThenSettlesAt(725)).classification).toBe("suspeito");
  });

  it("voltar a 726 por hora não ativa, e a série deixa de ser suspeita", () => {
    const drop = signal(packageThenSettlesAt(726), "queda");
    expect(drop.value!).toBeGreaterThan(0.1);
    expect(drop.active).toBe(false);
    expect(classify(packageThenSettlesAt(726)).classification).toBe("inconclusivo");
  });
});

describe("série curta: menos de 24 horas", () => {
  it("23 horas é curta; 24 já é avaliada", () => {
    const series = (hours: number) => Array.from({ length: hours }, () => 100);
    expect(classify(series(23)).signals[0]).toMatchObject({ code: "serie_curta", active: true });
    expect(classify(series(24)).signals[0]).toMatchObject({ code: "serie_curta", active: false });
  });
});
