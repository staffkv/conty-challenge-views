import { describe, expect, it } from "vitest";
import { classify } from "../src/classifier/index.ts";
import { EXAMPLES } from "../src/examples.ts";
import { FIXTURES } from "./fixtures/series.ts";

// O que o critério não detecta, escrito como teste: se uma mudança nas regras
// passar a acusar esses casos, o README precisa ser revisto junto.
describe("o que o classificador não detecta", () => {
  it("compra com a oscilação de público real não vira suspeita (no máximo inconclusiva)", () => {
    expect(classify(FIXTURES.noisyPurchase).classification).toBe("inconclusivo");
  });

  it("compra com desenho de viral é indistinguível de um viral", () => {
    // É a mesma série do pico orgânico do README: por hora, não há como separar.
    expect(classify(EXAMPLES.organic.views).classification).toBe("sem_indicios");
  });

  it("compra diluída, bem abaixo do salto mínimo, passa sem indícios", () => {
    expect(classify(FIXTURES.dilutedPurchase).classification).toBe("sem_indicios");
  });

  it("compra no lançamento fica inconclusiva, nunca suspeita", () => {
    expect(classify(FIXTURES.launchPurchase).classification).toBe("inconclusivo");
  });

  it("pulsos comprados num canal sem nenhum tráfego ficam inconclusivos", () => {
    expect(classify(FIXTURES.pulsesOnEmptyChannel).classification).toBe("inconclusivo");
  });
});
