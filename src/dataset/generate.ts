import { createHash } from "node:crypto";
import { FAMILIES, type Family, type Label, type Noise } from "./families.ts";
import { createRandom, deriveSeed } from "./random.ts";

export const GENERATOR_VERSION = "1.0.0";
export const EVALUATION_SEED = 20261010;
export const EVALUATION_PER_FAMILY = 200;
export const CALIBRATION_SEED = 424242;
export const CALIBRATION_PER_FAMILY = 50;

export interface SeriesRecord {
  id: string;
  family: string;
  label: Label;
  seed: number;
  views: number[];
}

export interface DatasetOptions {
  seed: number;
  perFamily: number;
  noise?: Noise;
  families?: readonly Family[];
}

export function generateDataset({ seed, perFamily, noise = "realista", families = FAMILIES }: DatasetOptions): SeriesRecord[] {
  const records: SeriesRecord[] = [];
  for (const family of families) {
    for (let index = 0; index < perFamily; index++) {
      const seriesSeed = deriveSeed(seed, family.name, index);
      records.push({
        id: `${family.name}-${String(index + 1).padStart(3, "0")}`,
        family: family.name,
        label: family.label,
        seed: seriesSeed,
        views: family.generate(createRandom(seriesSeed), noise),
      });
    }
  }
  return records;
}

// Cenário de estresse: as mesmas séries legítimas, mas com ruído de Poisson puro,
// o caso menos favorável às regras de regularidade.
export function generateStressDataset(seed: number, perFamily: number): SeriesRecord[] {
  return generateDataset({
    seed,
    perFamily,
    noise: "poisson",
    families: FAMILIES.filter((family) => family.label === "legitimo"),
  });
}

export function toJsonl(records: readonly SeriesRecord[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface Manifest {
  generator_version: string;
  seed: number;
  series_per_family: number;
  total_series: number;
  families: Record<string, { label: Label; series: number }>;
  sha256: string;
}

export function buildManifest(records: readonly SeriesRecord[], seed: number, perFamily: number): Manifest {
  const families: Manifest["families"] = {};
  for (const record of records) {
    families[record.family] ??= { label: record.label, series: 0 };
    families[record.family].series++;
  }
  return {
    generator_version: GENERATOR_VERSION,
    seed,
    series_per_family: perFamily,
    total_series: records.length,
    families,
    sha256: sha256(toJsonl(records)),
  };
}
