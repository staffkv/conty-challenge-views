import { describe, expect, it } from "vitest";
import { classify } from "../src/classifier/index.ts";
import { EXAMPLES } from "../src/examples.ts";
import { FIXTURES } from "./fixtures/series.ts";

function signal(views: readonly number[], code: string) {
  return classify(views).signals.find((item) => item.code === code)!;
}

describe("casos óbvios", () => {
  it("tráfego com ciclo diário não tem indícios: periodicidade de 24 horas não é acusação", () => {
    expect(classify(FIXTURES.dailyCycle).classification).toBe("sem_indicios");
  });

  it("zeros e poucas views repetidas não viram repetição mecânica", () => {
    const result = classify(FIXTURES.zerosAndSmallCounts);
    expect(result.classification).toBe("sem_indicios");
    expect(result.reason).toContain("abaixo de 200 views por hora");
  });

  it("pulsos iguais a cada 3 horas são suspeitos, com período e repetições na evidência", () => {
    const result = classify(FIXTURES.pulses);
    expect(result.classification).toBe("suspeito");
    const repetition = result.signals.find((item) => item.code === "repeticao")!;
    expect(repetition.active).toBe(true);
    expect(repetition.details).toMatchObject({ period_hours: 3, repetitions: 8 });
  });

  it("pulsos de alturas diferentes não são repetição mecânica", () => {
    const result = classify(FIXTURES.irregularPulses);
    expect(result.classification).not.toBe("suspeito");
    expect(signal(FIXTURES.irregularPulses, "repeticao").active).toBe(false);
  });

  it("criador pequeno que compra um pacote é suspeito: o piso de 20 views/h não esconde o salto", () => {
    const result = classify(FIXTURES.smallCreatorPackage);
    expect(result.classification).toBe("suspeito");
    expect(signal(FIXTURES.smallCreatorPackage, "salto").value).toBeCloseTo(3_005 / 20, 2);
  });

  it("vídeo que estourou com 50 mil views/h e oscilação abaixo de 2% não vira trecho fixo", () => {
    const stretch = FIXTURES.highVolumeHonest.slice(30, 38);
    const mean = stretch.reduce((sum, value) => sum + value, 0) / stretch.length;
    // Um limite fixo de 2% chamaria isto de trecho fixo...
    expect((Math.max(...stretch) - Math.min(...stretch)) / mean).toBeLessThan(0.02);
    // ...mas nesse volume o próprio acaso varia cerca de √50.000 ≈ 224 views por hora.
    const plateau = signal(FIXTURES.highVolumeHonest, "plato");
    expect(plateau.active).toBe(false);
    expect(plateau.value!).toBeGreaterThan(plateau.threshold!);
    expect(classify(FIXTURES.highVolumeHonest).classification).toBe("sem_indicios");
  });

  it("salto, trecho fixo e queda em eventos diferentes não se combinam numa acusação", () => {
    const result = classify(FIXTURES.separateEvents);
    expect(result.classification).not.toBe("suspeito");
    // O trecho fixo desliga de uma vez, mas não saltou 8 vezes...
    expect(signal(FIXTURES.separateEvents, "plato").active).toBe(true);
    expect(signal(FIXTURES.separateEvents, "queda").active).toBe(true);
    expect(signal(FIXTURES.separateEvents, "salto").active).toBe(false);
    // ...e o salto de 20 vezes que existe está em outro evento, o viral do começo da série.
    expect(signal(FIXTURES.separateEvents.slice(0, 60), "salto").active).toBe(true);
  });
});

describe("contrato do classificador", () => {
  it("mesma entrada, mesma resposta, e a entrada não é alterada", () => {
    const views = Object.freeze([...EXAMPLES.bought.views]);
    const first = classify(views);
    const second = classify(views);
    expect(second).toEqual(first);
    expect(views).toEqual(EXAMPLES.bought.views);
  });

  it("toda resposta traz os seis sinais, com horas a partir de 1", () => {
    for (const views of [EXAMPLES.organic.views, EXAMPLES.bought.views, FIXTURES.short, FIXTURES.pulses]) {
      const result = classify(views);
      expect(result.signals.map((item) => item.code)).toEqual([
        "serie_curta",
        "salto",
        "plato",
        "queda",
        "cauda",
        "repeticao",
      ]);
      for (const item of result.signals) {
        if (item.start_hour !== null) {
          expect(item.start_hour).toBeGreaterThanOrEqual(1);
          expect(item.end_hour!).toBeLessThanOrEqual(views.length);
        }
        if (item.value === null) expect(item.note).not.toBeNull();
      }
    }
  });

  it("o evento decisivo usa a mesma numeração de horas do motivo", () => {
    const result = classify(EXAMPLES.bought.views);
    expect(result.event).toMatchObject({ kind: "pico", start_hour: 31, end_hour: 38 });
    expect(result.reason).toContain("Entre a 31ª e a 38ª hora");
  });
});
