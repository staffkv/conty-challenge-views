import type { Rules } from "./rules.ts";
import { mean, median } from "./stats.ts";

// Índices aqui são posições do array (0 = primeira hora). A conversão para
// "hora 1, 2, 3..." acontece só na resposta e no texto.

export interface Baseline {
  perHour: number;
  start: number;
  end: number;
}

export function baselineBefore(views: readonly number[], index: number, rules: Rules): Baseline | null {
  const start = Math.max(0, index - rules.baseline.windowHours);
  if (index - start < rules.baseline.minHours) return null;
  return { perHour: median(views.slice(start, index)), start, end: index - 1 };
}

export function jumpRatio(peakViews: number, baseline: Baseline, rules: Rules): number {
  return peakViews / Math.max(baseline.perHour, rules.baseline.floorPerHour);
}

export interface Spike {
  start: number;
  peak: number;
  end: number;
  baseline: Baseline;
}

// Um pico começa na primeira hora com views ≥ 8 × o ritmo anterior e termina
// quando as views ficam abaixo da metade do maior valor visto até ali.
export function findSpikes(views: readonly number[], rules: Rules): Spike[] {
  const spikes: Spike[] = [];
  let index = 0;
  while (index < views.length) {
    const baseline = baselineBefore(views, index, rules);
    const value = views[index];
    const qualifies =
      baseline !== null &&
      value >= rules.jump.minPeakViews &&
      jumpRatio(value, baseline, rules) >= rules.jump.minRatio;
    if (!qualifies) {
      index++;
      continue;
    }
    let peak = index;
    let cursor = index;
    while (cursor + 1 < views.length && views[cursor + 1] >= rules.event.endFractionOfPeak * views[peak]) {
      cursor++;
      if (views[cursor] > views[peak]) peak = cursor;
    }
    spikes.push({ start: index, peak, end: cursor, baseline });
    index = cursor + 1;
  }
  return spikes;
}

export interface Run {
  start: number;
  end: number;
}

export function runLength(run: Run): number {
  return run.end - run.start + 1;
}

function medianOfSorted(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function insertionIndex(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

// Trechos estáveis: sequências máximas, sem sobreposição, em que cada hora fica
// perto da mediana do trecho. A regularidade é avaliada depois, no trecho inteiro.
export function findStableRuns(views: readonly number[], rules: Rules): Run[] {
  const runs: Run[] = [];
  let start = 0;
  while (start < views.length) {
    const sorted = [views[start]];
    let low = views[start];
    let high = views[start];
    let end = start;
    while (end + 1 < views.length) {
      const next = views[end + 1];
      const position = insertionIndex(sorted, next);
      sorted.splice(position, 0, next);
      const center = medianOfSorted(sorted);
      const tolerance = rules.stableRun.toleranceSqrt * Math.sqrt(center);
      const nextLow = Math.min(low, next);
      const nextHigh = Math.max(high, next);
      if (center - nextLow > tolerance || nextHigh - center > tolerance) {
        sorted.splice(position, 1);
        break;
      }
      low = nextLow;
      high = nextHigh;
      end++;
    }
    runs.push({ start, end });
    start = end + 1;
  }
  return runs;
}

export interface Repetition {
  start: number;
  end: number;
  period: number;
  repetitions: number;
  typicalBlock: number[];
  amplitude: number;
  relativeError: number;
  contrast: number;
  meanPerHour: number;
  zerosBetween: boolean;
}

function amplitudeOf(block: readonly number[]): number {
  return Math.max(...block) - Math.min(...block);
}

function blocksSimilar(
  views: readonly number[],
  first: number,
  second: number,
  period: number,
  tolerance: number,
): boolean {
  let difference = 0;
  const average: number[] = [];
  for (let offset = 0; offset < period; offset++) {
    difference += Math.abs(views[first + offset] - views[second + offset]);
    average.push((views[first + offset] + views[second + offset]) / 2);
  }
  const amplitude = amplitudeOf(average);
  return amplitude > 0 && difference / period <= tolerance * amplitude;
}

function describeRepetition(
  views: readonly number[],
  start: number,
  period: number,
  repetitions: number,
): Repetition {
  const typicalBlock: number[] = [];
  for (let offset = 0; offset < period; offset++) {
    const column: number[] = [];
    for (let block = 0; block < repetitions; block++) column.push(views[start + block * period + offset]);
    typicalBlock.push(median(column));
  }
  const end = start + repetitions * period - 1;
  const amplitude = amplitudeOf(typicalBlock);
  // Para cada hora do desenho, a diferença média entre as repetições e o desenho típico.
  // Vale a pior hora, em fração da altura do pulso.
  let worstDeviation = 0;
  let zerosBetween = typicalBlock.some((value) => value === 0);
  for (let offset = 0; offset < period; offset++) {
    let deviation = 0;
    for (let block = 0; block < repetitions; block++) {
      const value = views[start + block * period + offset];
      deviation += Math.abs(value - typicalBlock[offset]);
      if (typicalBlock[offset] === 0 && value !== 0) zerosBetween = false;
    }
    worstDeviation = Math.max(worstDeviation, deviation / repetitions);
  }
  return {
    start,
    end,
    period,
    repetitions,
    typicalBlock,
    amplitude,
    relativeError: amplitude > 0 ? worstDeviation / amplitude : Infinity,
    contrast: Math.max(...typicalBlock) / Math.max(Math.min(...typicalBlock), 1),
    meanPerHour: mean(views.slice(start, end + 1)),
    zerosBetween,
  };
}

function covers(repetition: Repetition): number {
  return repetition.end - repetition.start + 1;
}

// Mesmo desenho de 2 a 6 horas repetido em sequência. Entre todos os que se qualificam,
// fica o que cobre mais horas; empate: menor período, depois o mais cedo.
export function findRepetition(views: readonly number[], rules: Rules): Repetition | null {
  const limits = rules.repetition;
  let best: Repetition | null = null;
  for (let period = limits.minPeriodHours; period <= limits.maxPeriodHours; period++) {
    let start = 0;
    while (start + period * limits.minRepetitions <= views.length) {
      let repetitions = 1;
      while (
        start + (repetitions + 1) * period <= views.length &&
        blocksSimilar(
          views,
          start + (repetitions - 1) * period,
          start + repetitions * period,
          period,
          2 * limits.maxRelativeError,
        )
      ) {
        repetitions++;
      }
      if (repetitions < limits.minRepetitions) {
        start++;
        continue;
      }
      const candidate = describeRepetition(views, start, period, repetitions);
      if (candidate.amplitude < limits.minAmplitudeViews || candidate.contrast < limits.minContrast) {
        // Altura e contraste não mudam com a fase: nenhum recorte deste trecho se qualifica.
        start += repetitions * period;
        continue;
      }
      if (candidate.relativeError <= limits.maxRelativeError) {
        if (best === null || covers(candidate) > covers(best)) best = candidate;
        start += repetitions * period;
        continue;
      }
      start++;
    }
  }
  return best;
}
