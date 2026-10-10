// Gerador pseudoaleatório próprio (mulberry32), para o dataset não depender de
// Math.random(), do relógio ou de rede. Mesma seed, mesma sequência.

export interface Random {
  next(): number;
  uniform(min: number, max: number): number;
  int(min: number, max: number): number;
  logUniform(min: number, max: number): number;
  chance(probability: number): boolean;
  normal(): number;
  poisson(mean: number): number;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (): number => {
    const u = 1 - next();
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    next,
    uniform: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    logUniform: (min, max) => Math.exp(Math.log(min) + (Math.log(max) - Math.log(min)) * next()),
    chance: (probability) => next() < probability,
    normal,
    poisson: (mean) => {
      if (mean <= 0) return 0;
      if (mean < 30) {
        const limit = Math.exp(-mean);
        let count = 0;
        let product = next();
        while (product > limit) {
          count++;
          product *= next();
        }
        return count;
      }
      return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal()));
    },
  };
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mix(value: number): number {
  let hash = value >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

// Seed de cada série: depende só da seed base, do nome da família e da posição.
export function deriveSeed(baseSeed: number, family: string, index: number): number {
  return mix(mix(baseSeed ^ fnv1a(family)) ^ mix(index + 1));
}
