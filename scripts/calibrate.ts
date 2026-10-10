// Calibração: mede as regras atuais e algumas variações no conjunto de calibração
// (seed própria, separada da avaliação). Os limiares são escolhidos aqui, nunca
// olhando o conjunto de avaliação.
import { RULES, type Rules } from "../src/classifier/index.ts";
import { formatPercent } from "../src/classifier/format.ts";
import { FAMILIES } from "../src/dataset/families.ts";
import {
  CALIBRATION_PER_FAMILY,
  CALIBRATION_SEED,
  generateDataset,
  generateStressDataset,
} from "../src/dataset/generate.ts";
import { CLASSES, classifyAll, measure, type Rate } from "../src/evaluation/metrics.ts";

const dataset = generateDataset({ seed: CALIBRATION_SEED, perFamily: CALIBRATION_PER_FAMILY });
const stress = generateStressDataset(CALIBRATION_SEED, CALIBRATION_PER_FAMILY);

function rate(value: Rate): string {
  return `${String(value.numerator).padStart(4)}/${value.denominator} = ${formatPercent(value.value, 2).padStart(7)}`;
}

function evaluate(rules: Rules) {
  return { main: measure(classifyAll(dataset, rules)), stress: measure(classifyAll(stress, rules)) };
}

const current = evaluate(RULES);
console.log(`Calibração: seed ${CALIBRATION_SEED}, ${dataset.length} séries (+ ${stress.length} de estresse), regras ${RULES.version}\n`);
console.log("Família                  Origem       sem_indicios inconclusivo suspeito");
for (const family of FAMILIES) {
  const counts = current.main.byFamily[family.name];
  console.log(
    `${family.name.padEnd(24)} ${family.label.padEnd(12)} ${CLASSES.map((name) => String(counts[name]).padStart(12)).join(" ")}`,
  );
}
console.log(`\nFalso positivo:            ${rate(current.main.falsePositive)}`);
console.log(`Falso positivo (estresse): ${rate(current.stress.falsePositive)}`);
console.log(`Legítimos inconclusivos:   ${rate(current.main.legitimateInconclusive)}`);
console.log(`Detecção:                  ${rate(current.main.detection)}`);

if (process.argv.includes("--grid")) {
  console.log("\nVariações (fator do acaso no trecho fixo, erro máximo da repetição, salto mínimo):");
  console.log("acaso  erro  salto   falso positivo        estresse              detecção");
  for (const chanceFactor of [0.35, 0.5, 0.65]) {
    for (const maxRelativeError of [0.03, 0.05, 0.08]) {
      for (const minRatio of [6, 8, 10]) {
        const rules: Rules = {
          ...RULES,
          plateau: { ...RULES.plateau, chanceFactor },
          repetition: { ...RULES.repetition, maxRelativeError },
          jump: { ...RULES.jump, minRatio },
        };
        const result = evaluate(rules);
        console.log(
          `${String(chanceFactor).padEnd(6)} ${String(maxRelativeError).padEnd(5)} ${String(minRatio).padEnd(6)} ` +
            `${rate(result.main.falsePositive)}  ${rate(result.stress.falsePositive)}  ${rate(result.main.detection)}`,
        );
      }
    }
  }
}
