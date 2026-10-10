import { RULES, type Rules } from "../classifier/index.ts";
import {
  buildManifest,
  EVALUATION_PER_FAMILY,
  EVALUATION_SEED,
  generateDataset,
  generateStressDataset,
  toJsonl,
  type Manifest,
  type SeriesRecord,
} from "../dataset/generate.ts";
import { classifyAll, measure, type Metrics, type SeriesResult } from "./metrics.ts";
import type { BlockName } from "./readme-blocks.ts";
import { renderBlocks } from "./report.ts";

export interface EvaluationRun {
  dataset: SeriesRecord[];
  jsonl: string;
  manifest: Manifest;
  results: SeriesResult[];
  metrics: Metrics;
  stress: Metrics;
  blocks: Record<BlockName, string>;
}

// Tudo em memória: gera o dataset, classifica e monta os blocos do README.
// O comando grava o resultado; o teste do README só compara.
export function runEvaluation(rules: Rules = RULES): EvaluationRun {
  const dataset = generateDataset({ seed: EVALUATION_SEED, perFamily: EVALUATION_PER_FAMILY });
  const jsonl = toJsonl(dataset);
  const manifest = buildManifest(dataset, EVALUATION_SEED, EVALUATION_PER_FAMILY);
  const results = classifyAll(dataset, rules);
  const metrics = measure(results);
  const stress = measure(classifyAll(generateStressDataset(EVALUATION_SEED, EVALUATION_PER_FAMILY), rules));
  return { dataset, jsonl, manifest, results, metrics, stress, blocks: renderBlocks(manifest, metrics, stress, rules) };
}
