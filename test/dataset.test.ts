import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAMILIES } from "../src/dataset/families.ts";
import {
  buildManifest,
  EVALUATION_PER_FAMILY,
  EVALUATION_SEED,
  generateDataset,
  generateStressDataset,
  sha256,
  toJsonl,
  type Manifest,
} from "../src/dataset/generate.ts";

const dataset = generateDataset({ seed: EVALUATION_SEED, perFamily: EVALUATION_PER_FAMILY });
const jsonl = toJsonl(dataset);

describe("dataset sintético reproduzível", () => {
  it("regenerar com a mesma seed produz o arquivo versionado, byte a byte", () => {
    const manifest = JSON.parse(readFileSync("data/manifest.json", "utf8")) as Manifest;
    expect(sha256(jsonl)).toBe(manifest.sha256);
    expect(sha256(readFileSync("data/dataset.jsonl", "utf8"))).toBe(manifest.sha256);
    expect(buildManifest(dataset, EVALUATION_SEED, EVALUATION_PER_FAMILY)).toEqual(manifest);
  });

  it("gerar duas vezes dá o mesmo resultado", () => {
    expect(toJsonl(generateDataset({ seed: EVALUATION_SEED, perFamily: EVALUATION_PER_FAMILY }))).toBe(jsonl);
  });

  it("outra seed gera outro dataset", () => {
    const other = generateDataset({ seed: EVALUATION_SEED + 1, perFamily: 5 });
    expect(other[0].views).not.toEqual(dataset[0].views);
  });

  it("tem 200 séries por família, ids únicos e contagens inteiras não negativas", () => {
    for (const family of FAMILIES) {
      expect(dataset.filter((record) => record.family === family.name)).toHaveLength(EVALUATION_PER_FAMILY);
    }
    expect(new Set(dataset.map((record) => record.id)).size).toBe(dataset.length);
    for (const record of dataset) {
      expect(record.views.length).toBeGreaterThanOrEqual(24);
      expect(record.views.length).toBeLessThanOrEqual(168);
      expect(record.views.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
    }
  });

  it("o cenário de estresse muda só o ruído das séries legítimas", () => {
    const stress = generateStressDataset(EVALUATION_SEED, EVALUATION_PER_FAMILY);
    const legit = dataset.filter((record) => record.label === "legitimo");
    expect(stress.map((record) => record.id)).toEqual(legit.map((record) => record.id));
    expect(stress.map((record) => record.views.length)).toEqual(legit.map((record) => record.views.length));
  });
});
