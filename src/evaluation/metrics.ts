import { classify, RULES, type Classification, type Rules } from "../classifier/index.ts";
import type { SeriesRecord } from "../dataset/generate.ts";

export const CLASSES: readonly Classification[] = ["sem_indicios", "inconclusivo", "suspeito"];

export type Counts = Record<Classification, number> & { total: number };

export interface SeriesResult {
  id: string;
  family: string;
  label: SeriesRecord["label"];
  classification: Classification;
}

export interface Rate {
  numerator: number;
  denominator: number;
  value: number;
  low: number;
  high: number;
}

export interface Metrics {
  byLabel: Record<SeriesRecord["label"], Counts>;
  byFamily: Record<string, Counts>;
  falsePositive: Rate;
  legitimateInconclusive: Rate;
  pessimisticFalsePositive: Rate;
  detection: Rate;
  precision: Rate;
}

function emptyCounts(): Counts {
  return { sem_indicios: 0, inconclusivo: 0, suspeito: 0, total: 0 };
}

// Intervalo de Wilson (95%): não colapsa para [0, 0] quando não há nenhum caso.
export function wilson(numerator: number, denominator: number, z = 1.959963984540054): Rate {
  if (denominator === 0) return { numerator, denominator, value: 0, low: 0, high: 0 };
  const p = numerator / denominator;
  const z2 = z * z;
  const center = (p + z2 / (2 * denominator)) / (1 + z2 / denominator);
  const half = (z * Math.sqrt((p * (1 - p)) / denominator + z2 / (4 * denominator * denominator))) / (1 + z2 / denominator);
  return { numerator, denominator, value: p, low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

export function classifyAll(records: readonly SeriesRecord[], rules: Rules = RULES): SeriesResult[] {
  return records.map((record) => ({
    id: record.id,
    family: record.family,
    label: record.label,
    classification: classify(record.views, rules).classification,
  }));
}

export function measure(results: readonly SeriesResult[]): Metrics {
  const byLabel = { legitimo: emptyCounts(), artificial: emptyCounts() };
  const byFamily: Record<string, Counts> = {};
  for (const result of results) {
    byFamily[result.family] ??= emptyCounts();
    for (const counts of [byLabel[result.label], byFamily[result.family]]) {
      counts[result.classification]++;
      counts.total++;
    }
  }
  const legit = byLabel.legitimo;
  const artificial = byLabel.artificial;
  return {
    byLabel,
    byFamily,
    falsePositive: wilson(legit.suspeito, legit.total),
    legitimateInconclusive: wilson(legit.inconclusivo, legit.total),
    pessimisticFalsePositive: wilson(legit.suspeito + legit.inconclusivo, legit.total),
    detection: wilson(artificial.suspeito, artificial.total),
    precision: wilson(artificial.suspeito, artificial.suspeito + legit.suspeito),
  };
}
