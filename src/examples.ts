// Séries escritas à mão para o README e para os testes dos casos óbvios.
// Não usam o gerador do dataset: assim um erro no gerador não esconde um erro no classificador.

// Variação "de público real" em torno de um nível: ±8%, média 1.
export const VARIATION = [1.0, 1.06, 0.95, 1.03, 0.92, 1.08, 0.97, 1.02, 0.94, 1.05, 0.99, 0.99] as const;

export function natural(level: number, hours: number, offset = 0): number[] {
  return Array.from({ length: hours }, (_, hour) => Math.round(level * VARIATION[(hour + offset) % VARIATION.length]));
}

// Pico orgânico: sobe em 3 horas e cai aos poucos (o excesso perde 13% por hora).
export function organicPeak(base: number, hours: number, peakHour: number, peakExcess: number): number[] {
  return Array.from({ length: hours }, (_, hour) => {
    let excess = 0;
    if (hour === peakHour - 2) excess = peakExcess * 0.26;
    else if (hour === peakHour - 1) excess = peakExcess * 0.62;
    else if (hour >= peakHour) excess = peakExcess * 0.87 ** (hour - peakHour);
    return Math.round((base + excess) * VARIATION[hour % VARIATION.length]);
  });
}

// Pacote comprado: quantidade fixa por hora somada ao tráfego normal, depois desliga.
export function boughtPackage(base: number, hours: number, start: number, length: number, perHour: number): number[] {
  return natural(base, hours).map((value, hour) => (hour >= start && hour < start + length ? value + perHour : value));
}

export function burst(base: number, hours: number, at: number, views: number): number[] {
  return natural(base, hours).map((value, hour) => (hour === at ? views : value));
}

export interface Example {
  id: string;
  title: string;
  description: string;
  views: number[];
}

// Os dois primeiros têm o mesmo pico (~5.000 views/h) e quase o mesmo volume extra;
// muda só o desenho. O terceiro é o caso em que o classificador prefere não acusar.
export const EXAMPLES = {
  organic: {
    id: "organico",
    title: "Pico orgânico",
    description: "Sobe em três horas até cerca de 5.000 views/h e cai aos poucos.",
    views: organicPeak(250, 72, 31, 4_750),
  },
  bought: {
    id: "comprado",
    title: "Pico comprado",
    description: "4.750 views/h somadas ao tráfego normal durante 8 horas, depois desliga.",
    views: boughtPackage(250, 72, 30, 8, 4_750),
  },
  burst: {
    id: "rajada",
    title: "Rajada curta",
    description: "Uma hora com 6.000 views e volta imediata ao ritmo de antes.",
    views: burst(300, 72, 39, 6_000),
  },
} satisfies Record<string, Example>;
