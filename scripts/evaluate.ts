// npm run evaluate                    gera o dataset, classifica e imprime as taxas; avisa se o README diverge
// npm run evaluate -- --write-readme  o mesmo e reescreve só os blocos gerados do README
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES } from "../src/classifier/index.ts";
import { formatPercent } from "../src/classifier/format.ts";
import type { Rate } from "../src/evaluation/metrics.ts";
import { BLOCK_NAMES, extractBlock, replaceBlock } from "../src/evaluation/readme-blocks.ts";
import { runEvaluation } from "../src/evaluation/run.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const writeReadme = process.argv.includes("--write-readme");

const run = runEvaluation();

mkdirSync(join(root, "data"), { recursive: true });
writeFileSync(join(root, "data", "dataset.jsonl"), run.jsonl);
writeFileSync(join(root, "data", "manifest.json"), `${JSON.stringify(run.manifest, null, 2)}\n`);
mkdirSync(join(root, "reports"), { recursive: true });
writeFileSync(
  join(root, "reports", "evaluation.json"),
  `${JSON.stringify({ rules_version: RULES.version, manifest: run.manifest, metrics: run.metrics, stress: run.stress, results: run.results }, null, 2)}\n`,
);

const integer = new Intl.NumberFormat("pt-BR");
function line(label: string, rate: Rate): string {
  return (
    `${label.padEnd(44)} ${integer.format(rate.numerator)} de ${integer.format(rate.denominator)} = ` +
    `${formatPercent(rate.value, 2)} (IC 95%: ${formatPercent(rate.low, 2)} a ${formatPercent(rate.high, 2)})`
  );
}

console.log(`Dataset: data/dataset.jsonl, ${integer.format(run.manifest.total_series)} séries, seed ${run.manifest.seed}, SHA-256 ${run.manifest.sha256.slice(0, 16)}`);
console.log(`Regras: ${RULES.version}\n`);
console.log(line("Falso positivo (legítimas → suspeito)", run.metrics.falsePositive));
console.log(line("Legítimas → inconclusivo", run.metrics.legitimateInconclusive));
console.log(line("Falso positivo pessimista", run.metrics.pessimisticFalsePositive));
console.log(line("Detecção (artificiais → suspeito)", run.metrics.detection));
console.log(line("Precisão das acusações", run.metrics.precision));
console.log(line("Falso positivo no estresse (Poisson puro)", run.stress.falsePositive));

const readmePath = join(root, "README.md");
const readme = readFileSync(readmePath, "utf8");
if (writeReadme) {
  let updated = readme;
  for (const name of BLOCK_NAMES) updated = replaceBlock(updated, name, run.blocks[name]);
  writeFileSync(readmePath, updated);
  console.log("\nREADME: blocos gerados atualizados.");
} else {
  const stale = BLOCK_NAMES.filter((name) => extractBlock(readme, name) !== run.blocks[name]);
  console.log(
    stale.length === 0
      ? "\nREADME: em dia com o medido."
      : `\nREADME: divergente nos blocos ${stale.join(", ")}. Rode npm run evaluate -- --write-readme.`,
  );
}
