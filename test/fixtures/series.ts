// Séries escritas à mão para os casos óbvios. Usam só os construtores simples de
// src/examples.ts, nunca o gerador do dataset.
import { natural, VARIATION } from "../../src/examples.ts";

// 12 horas com mediana exatamente 250: base para os testes de limite.
export const BASELINE_12 = [230, 270, 250, 240, 260, 250, 235, 265, 250, 245, 255, 250];

export function repeat(values: readonly number[], times: number): number[] {
  return Array.from({ length: times }, () => values).flat();
}

export function concat(...parts: readonly (readonly number[])[]): number[] {
  return parts.flat();
}

export const FIXTURES = {
  dailyCycle: Array.from({ length: 96 }, (_, hour) =>
    Math.round(1_000 * (1 + 0.5 * Math.sin((2 * Math.PI * hour) / 24)) * VARIATION[hour % VARIATION.length]),
  ),
  zerosAndSmallCounts: repeat([0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 3, 0], 8),
  pulses: natural(20, 72).map((value, hour) => (hour >= 24 && hour < 48 && (hour - 24) % 3 === 0 ? value + 2_000 : value)),
  // Pulsos a cada 3 horas, mas de alturas diferentes, como numa sequência de divulgações.
  irregularPulses: (() => {
    const heights = [2_000, 2_600, 1_500, 2_300, 1_800, 2_900, 1_400, 2_200];
    return natural(20, 72).map((value, hour) =>
      hour >= 24 && hour < 48 && (hour - 24) % 3 === 0 ? value + heights[(hour - 24) / 3] : value,
    );
  })(),
  pulsesOnEmptyChannel: Array.from({ length: 72 }, (_, hour) => (hour >= 24 && hour < 48 && (hour - 24) % 3 === 0 ? 2_000 : 0)),
  smallCreatorPackage: natural(5, 72).map((value, hour) => (hour >= 30 && hour < 38 ? value + 3_000 : value)),
  // Vídeo que estourou: 8 horas perto de 50 mil views/h, oscilando menos de 2%, e queda gradual.
  highVolumeHonest: concat(
    natural(2_000, 30),
    [50_000, 50_300, 49_800, 50_200, 49_700, 50_250, 49_900, 50_100],
    [45_000, 40_000, 35_000, 30_000, 25_000, 20_000, 16_000, 12_000, 9_000, 7_000, 5_500, 4_500, 3_600, 3_000, 2_600],
    natural(2_000, 12),
  ),
  launchPurchase: natural(30, 48).map((value, hour) => (hour < 10 ? value + 3_000 : value)),
  short: natural(300, 12),
  peakAtLastHour: [...natural(300, 47), 6_000],
  // O salto está num evento (um viral com cauda); o trecho fixo e a volta brusca, em outro,
  // que fica só 6,7 vezes acima do ritmo anterior.
  separateEvents: (() => {
    const views = natural(300, 120);
    for (let hour = 20; hour < 48; hour++) views[hour] = Math.round((300 + 6_000 * 0.87 ** (hour - 20)) * VARIATION[hour % 12]);
    for (let hour = 70; hour < 82; hour++) views[hour] = 2_000;
    return views;
  })(),
  noisyPurchase: natural(250, 72).map((value, hour) =>
    hour >= 30 && hour < 38 ? Math.round(5_000 * VARIATION[hour % VARIATION.length]) : value,
  ),
  dilutedPurchase: natural(250, 96).map((value, hour) => (hour >= 24 ? value + 400 : value)),
};

export function jumpAt(peak: number): number[] {
  return concat(repeat(BASELINE_12, 3), [peak], repeat(BASELINE_12, 3));
}

export function plateauWithSwing(swing: number): number[] {
  const plateau = Array.from({ length: 8 }, (_, hour) => (hour % 2 === 0 ? 10_000 + swing : 10_000 - swing));
  return concat(repeat(BASELINE_12, 3), plateau, repeat(BASELINE_12, 3));
}

export function packageThenSettlesAt(level: number): number[] {
  return concat(repeat(BASELINE_12, 3), Array(8).fill(5_000), [level, level, level], repeat(BASELINE_12, 3));
}
