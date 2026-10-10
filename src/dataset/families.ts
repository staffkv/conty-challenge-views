import type { Random } from "./random.ts";

// Cada família descreve um jeito de uma série de views por hora nascer.
// Os parâmetros estruturais são sorteados antes do ruído, para que o cenário de
// estresse (ruído de Poisson puro) mude só o ruído das séries legítimas.

export type Label = "legitimo" | "artificial";
export type Noise = "realista" | "poisson";

export interface Family {
  name: string;
  title: string;
  label: Label;
  shape: string;
  expected: string;
  role: string;
  generate(rng: Random, noise: Noise): number[];
}

interface Organic {
  base: number;
  amplitude: number;
  phase: number;
  trend: number;
  spread: number;
}

function organicProfile(rng: Random, base: number): Organic {
  return {
    base,
    amplitude: rng.uniform(0.2, 0.6),
    phase: rng.uniform(0, 24),
    trend: rng.uniform(-0.004, 0.004),
    spread: rng.uniform(0.05, 0.2),
  };
}

function organicRate(profile: Organic, hour: number): number {
  const daily = 1 + profile.amplitude * Math.sin((2 * Math.PI * (hour + profile.phase)) / 24);
  return profile.base * daily * Math.exp(profile.trend * hour);
}

// Público real: chegadas independentes (Poisson) e, no modo realista, uma variação
// extra de hora para hora (multiplicativa), porque audiência real oscila mais que o acaso.
function humanCount(rng: Random, rate: number, spread: number, noise: Noise): number {
  const factor = noise === "realista" && spread > 0 ? Math.exp(spread * rng.normal() - (spread * spread) / 2) : 1;
  return rng.poisson(rate * factor);
}

function hoursOf(count: number): number[] {
  return Array.from({ length: count }, (_, hour) => hour);
}

// Excesso de um pico com subida em `rise` horas e meia-vida `halfLife` na descida.
function bump(hour: number, peakAt: number, excess: number, rise: number, halfLife: number): number {
  if (hour >= peakAt) return excess * 0.5 ** ((hour - peakAt) / halfLife);
  if (hour < peakAt - rise) return 0;
  return excess * ((hour - (peakAt - rise) + 1) / (rise + 1)) ** 2;
}

function jittered(rng: Random, amount: number, jitter: number): number {
  return Math.round(amount * (1 + jitter * (2 * rng.next() - 1)));
}

const dailyCycle: Family = {
  name: "ciclo_diario",
  title: "Ciclo diário",
  label: "legitimo",
  shape: "Ritmo de 24 horas com variação de público real",
  expected: "sem_indicios",
  role: "Base",
  generate(rng, noise) {
    const hours = rng.int(24, 168);
    const profile = organicProfile(rng, rng.logUniform(30, 20_000));
    return hoursOf(hours).map((hour) => humanCount(rng, organicRate(profile, hour), profile.spread, noise));
  },
};

const viral: Family = {
  name: "viral",
  title: "Viral",
  label: "legitimo",
  shape: "Subida irregular e cauda longa, no meio da série ou logo no lançamento",
  expected: "sem_indicios",
  role: "Par do pacote comprado",
  generate(rng, noise) {
    const hours = rng.int(48, 168);
    const profile = organicProfile(rng, rng.logUniform(20, 5_000));
    const atLaunch = rng.chance(0.3);
    const excess = profile.base * (rng.logUniform(8, 80) - 1);
    const rise = rng.int(1, 6);
    const halfLife = rng.uniform(3, 18);
    const peakAt = atLaunch ? rng.int(0, 2) : rng.int(12, hours - 24);
    return hoursOf(hours).map((hour) =>
      humanCount(rng, organicRate(profile, hour) + bump(hour, peakAt, excess, rise, halfLife), profile.spread, noise),
    );
  },
};

const shortEvent: Family = {
  name: "evento_curto",
  title: "Evento curto",
  label: "legitimo",
  shape: "Pico de 1 a 2 horas e volta ao ritmo de antes (menção em live ou TV)",
  expected: "inconclusivo",
  role: "Abstenção",
  generate(rng, noise) {
    const hours = rng.int(36, 168);
    const profile = organicProfile(rng, rng.logUniform(30, 3_000));
    const at = rng.int(12, hours - 8);
    const length = rng.int(1, 2);
    const excess = profile.base * (rng.logUniform(8, 60) - 1);
    const residual = rng.uniform(0, 0.05);
    const residualHours = rng.int(0, 2);
    return hoursOf(hours).map((hour) => {
      let extra = 0;
      if (hour >= at && hour < at + length) extra = excess;
      else if (hour >= at + length && hour < at + length + residualHours) extra = excess * residual;
      return humanCount(rng, organicRate(profile, hour) + extra, profile.spread, noise);
    });
  },
};

const steadyCampaign: Family = {
  name: "campanha_estavel",
  title: "Campanha estável",
  label: "legitimo",
  shape:
    "Impulsionamento pago com ritmo quase constante e fim marcado; em parte das séries a plataforma entrega um teto fixo de exibições por hora e conta a view no autoplay",
  expected: "sem_indicios ou inconclusivo",
  role: "Caso difícil e principal fonte esperada de falso positivo",
  generate(rng, noise) {
    const hours = rng.int(48, 168);
    const profile = organicProfile(rng, rng.logUniform(20, 2_000));
    const length = rng.int(6, Math.min(48, hours - 18));
    const start = rng.int(12, hours - length - 6);
    const level = profile.base * rng.logUniform(3, 40);
    const capped = rng.chance(0.35);
    const viewRate = rng.uniform(0.5, 0.98);
    const pacing = rng.uniform(0, 0.25);
    const pacingPhase = rng.uniform(0, 24);
    const campaignSpread = rng.uniform(0.02, 0.1);
    const firstHour = rng.chance(0.5) ? rng.uniform(0.2, 0.9) : 1;
    const extraHour = rng.chance(0.5) ? rng.uniform(0.2, 0.9) : 0;

    const campaign = (hour: number): number => {
      const share =
        hour === start ? firstHour : hour > start && hour < start + length ? 1 : hour === start + length ? extraHour : 0;
      if (share === 0) return 0;
      if (capped) {
        // Exibições por hora fixas pelo teto; cada exibição vira view com probabilidade viewRate.
        const shown = (level * share) / viewRate;
        const spread = Math.sqrt(shown * viewRate * (1 - viewRate));
        return Math.min(Math.round(shown), Math.max(0, Math.round(shown * viewRate + spread * rng.normal())));
      }
      const rate = level * share * (1 + pacing * Math.sin((2 * Math.PI * (hour + pacingPhase)) / 24));
      return humanCount(rng, rate, campaignSpread, noise);
    };
    return hoursOf(hours).map(
      (hour) => humanCount(rng, organicRate(profile, hour), profile.spread, noise) + campaign(hour),
    );
  },
};

const lowVolume: Family = {
  name: "baixo_volume",
  title: "Baixo volume",
  label: "legitimo",
  shape: "Poucas views por hora, com muitos zeros",
  expected: "sem_indicios",
  role: "Proteção contra repetição trivial",
  generate(rng, noise) {
    const hours = rng.int(24, 168);
    const profile = { ...organicProfile(rng, rng.uniform(0, 12)), trend: 0 };
    return hoursOf(hours).map((hour) => humanCount(rng, organicRate(profile, hour), profile.spread, noise));
  },
};

const waves: Family = {
  name: "ondas",
  title: "Ondas",
  label: "legitimo",
  shape: "Várias divulgações ao longo da série, cada uma com cauda",
  expected: "sem_indicios",
  role: "Vários eventos na mesma série",
  generate(rng, noise) {
    const hours = rng.int(72, 168);
    const profile = organicProfile(rng, rng.logUniform(20, 3_000));
    const list = hoursOf(rng.int(2, 4)).map(() => ({
      at: rng.int(6, hours - 12),
      excess: profile.base * (rng.logUniform(3, 30) - 1),
      rise: rng.int(0, 3),
      halfLife: rng.uniform(2, 12),
    }));
    return hoursOf(hours).map((hour) => {
      const extra = list.reduce((sum, wave) => sum + bump(hour, wave.at, wave.excess, wave.rise, wave.halfLife), 0);
      return humanCount(rng, organicRate(profile, hour) + extra, profile.spread, noise);
    });
  },
};

const batchedCounter: Family = {
  name: "contador_em_lotes",
  title: "Contador em lotes",
  label: "legitimo",
  shape: "Tráfego real, mas a plataforma só atualiza o contador a cada 2 a 6 horas",
  expected: "inconclusivo",
  role: "Erro de coleta que parece pulso",
  generate(rng, noise) {
    const hours = rng.int(36, 168);
    const profile = organicProfile(rng, rng.logUniform(30, 5_000));
    const batch = rng.int(2, 6);
    const offset = rng.int(0, batch - 1);
    const reported: number[] = [];
    let pending = 0;
    for (const hour of hoursOf(hours)) {
      pending += humanCount(rng, organicRate(profile, hour), profile.spread, noise);
      if ((hour + offset) % batch === batch - 1) {
        reported.push(pending);
        pending = 0;
      } else {
        reported.push(0);
      }
    }
    return reported;
  },
};

const purchasedPackage: Family = {
  name: "pacote",
  title: "Pacote",
  label: "artificial",
  shape: "Quantidade fixa por hora somada ao tráfego normal, por 6 a 24 horas, depois desliga",
  expected: "suspeito",
  role: "Par do viral",
  generate(rng) {
    const hours = rng.int(48, 168);
    const profile = organicProfile(rng, rng.logUniform(20, 3_000));
    const length = rng.int(6, Math.min(24, hours - 18));
    const start = rng.int(12, hours - length - 6);
    const perHour = profile.base * rng.logUniform(6, 60);
    const jitter = rng.uniform(0, 0.005);
    const before = rng.chance(0.5) ? rng.uniform(0.1, 0.9) : 0;
    const after = rng.chance(0.5) ? rng.uniform(0.1, 0.9) : 0;
    return hoursOf(hours).map((hour) => {
      let bot = 0;
      if (hour >= start && hour < start + length) bot = jittered(rng, perHour, jitter);
      else if (hour === start - 1) bot = Math.round(perHour * before);
      else if (hour === start + length) bot = Math.round(perHour * after);
      return humanCount(rng, organicRate(profile, hour), profile.spread, "realista") + bot;
    });
  },
};

const pulses: Family = {
  name: "pulsos",
  title: "Pulsos",
  label: "artificial",
  shape: "Pulsos iguais a cada 2 a 6 horas",
  expected: "suspeito",
  role: "Repetição",
  generate(rng) {
    const hours = rng.int(48, 168);
    const profile = organicProfile(rng, rng.logUniform(5, 300));
    const period = rng.int(2, 6);
    const count = rng.int(5, Math.max(5, Math.min(20, Math.floor((hours - 18) / period))));
    const size = Math.max(400, profile.base * rng.logUniform(8, 50));
    const jitter = rng.uniform(0, 0.01);
    const start = rng.int(12, Math.max(12, hours - period * count - 6));
    return hoursOf(hours).map((hour) => {
      const offset = hour - start;
      const pulse = offset >= 0 && offset % period === 0 && offset / period < count ? jittered(rng, size, jitter) : 0;
      return humanCount(rng, organicRate(profile, hour), profile.spread, "realista") + pulse;
    });
  },
};

const repeatedBlocks: Family = {
  name: "blocos",
  title: "Blocos",
  label: "artificial",
  shape: "Um desenho de 2 a 6 horas repetido várias vezes",
  expected: "suspeito",
  role: "Repetição",
  generate(rng) {
    const hours = rng.int(48, 168);
    const profile = organicProfile(rng, rng.logUniform(5, 300));
    const period = rng.int(2, 6);
    const repetitions = rng.int(4, Math.max(4, Math.min(12, Math.floor((hours - 18) / period))));
    const height = Math.max(400, profile.base * rng.logUniform(8, 50));
    const shape = hoursOf(period).map(() => rng.uniform(0.05, 1));
    const highIndex = rng.int(0, period - 1);
    const lowIndex = (highIndex + 1 + rng.int(0, period - 2)) % period;
    shape[highIndex] = 1;
    shape[lowIndex] = rng.uniform(0, 0.05);
    const jitter = rng.uniform(0, 0.01);
    const start = rng.int(12, Math.max(12, hours - period * repetitions - 6));
    return hoursOf(hours).map((hour) => {
      const offset = hour - start;
      const bot =
        offset >= 0 && offset < period * repetitions ? jittered(rng, height * shape[offset % period], jitter) : 0;
      return humanCount(rng, organicRate(profile, hour), profile.spread, "realista") + bot;
    });
  },
};

const launchPurchase: Family = {
  name: "compra_no_lancamento",
  title: "Compra no lançamento",
  label: "artificial",
  shape: "Quantidade fixa por hora desde a primeira hora da série, depois desliga",
  expected: "inconclusivo",
  role: "Ponto cego: não há ritmo anterior para comparar",
  generate(rng) {
    const hours = rng.int(36, 168);
    const base = rng.logUniform(5, 150);
    const spread = rng.uniform(0.05, 0.2);
    const length = rng.int(6, 24);
    const perHour = Math.max(500, base * rng.logUniform(15, 100));
    const jitter = rng.uniform(0, 0.005);
    const after = rng.chance(0.5) ? rng.uniform(0.1, 0.9) : 0;
    return hoursOf(hours).map((hour) => {
      const launch = base * (1 + 2 * 0.5 ** (hour / 6));
      let bot = 0;
      if (hour < length) bot = jittered(rng, perHour, jitter);
      else if (hour === length) bot = Math.round(perHour * after);
      return humanCount(rng, launch, spread, "realista") + bot;
    });
  },
};

const quickBurst: Family = {
  name: "rajada",
  title: "Rajada",
  label: "artificial",
  shape: "Pico comprado de 1 a 2 horas e volta imediata, igual ao evento curto",
  expected: "inconclusivo",
  role: "O classificador se abstém dos dois lados",
  generate(rng) {
    const hours = rng.int(36, 168);
    const profile = organicProfile(rng, rng.logUniform(30, 3_000));
    const at = rng.int(12, hours - 8);
    const length = rng.int(1, 2);
    const amount = Math.round(profile.base * rng.logUniform(8, 60));
    return hoursOf(hours).map(
      (hour) =>
        humanCount(rng, organicRate(profile, hour), profile.spread, "realista") +
        (hour >= at && hour < at + length ? amount : 0),
    );
  },
};

const disguised: Family = {
  name: "compra_disfarcada",
  title: "Compra disfarçada",
  label: "artificial",
  shape: "Compra com oscilação de público real, em ritmo constante ou com desenho de viral",
  expected: "sem_indicios ou inconclusivo",
  role: "Ponto cego documentado",
  generate(rng) {
    const hours = rng.int(48, 168);
    const profile = organicProfile(rng, rng.logUniform(20, 3_000));
    const viralShaped = rng.chance(0.5);
    const amount = profile.base * rng.logUniform(8, 40);
    const botSpread = rng.uniform(0.05, 0.15);
    const rise = rng.int(1, 4);
    const halfLife = rng.uniform(3, 12);
    const peakAt = rng.int(12, hours - 24);
    const length = rng.int(6, Math.min(24, hours - 18));
    const start = rng.int(12, hours - length - 6);
    return hoursOf(hours).map((hour) => {
      const botRate = viralShaped
        ? bump(hour, peakAt, amount, rise, halfLife)
        : hour >= start && hour < start + length
          ? amount
          : 0;
      return (
        humanCount(rng, organicRate(profile, hour), profile.spread, "realista") +
        humanCount(rng, botRate, botSpread, "realista")
      );
    });
  },
};

export const FAMILIES: readonly Family[] = [
  dailyCycle,
  viral,
  shortEvent,
  steadyCampaign,
  lowVolume,
  waves,
  batchedCounter,
  purchasedPackage,
  pulses,
  repeatedBlocks,
  launchPurchase,
  quickBurst,
  disguised,
];
