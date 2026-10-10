import { classify, RULES, type ClassificationResult, type Rules, type Signal } from "../classifier/index.ts";
import { formatPercent, formatTimes, formatViews } from "../classifier/format.ts";
import { FAMILIES } from "../dataset/families.ts";
import type { Manifest } from "../dataset/generate.ts";
import { EXAMPLES, type Example } from "../examples.ts";
import type { BlockName } from "./readme-blocks.ts";
import { CLASSES, type Metrics, type Rate } from "./metrics.ts";

const integer = new Intl.NumberFormat("pt-BR");
const GENERATED = "_Gerado por `npm run evaluate -- --write-readme`. Não edite à mão: `test/readme.test.ts` falha se este bloco divergir do código._";

function sparkline(views: readonly number[]): string {
  const bars = "▁▂▃▄▅▆▇█";
  const highest = Math.max(...views, 1);
  return views.map((value) => bars[Math.round((value / highest) * (bars.length - 1))]).join("");
}

function signalValue(signal: Signal): string {
  if (signal.value === null) return "—";
  switch (signal.code) {
    case "serie_curta":
      return `${signal.value} h`;
    case "salto":
      return `${formatTimes(signal.value)}×`;
    case "plato":
      return `${formatViews(signal.value)} views`;
    default:
      return formatPercent(signal.value);
  }
}

function signalThreshold(signal: Signal): string {
  if (signal.threshold === null) return "—";
  switch (signal.code) {
    case "serie_curta":
      return `< ${signal.threshold} h`;
    case "salto":
      return `≥ ${formatTimes(signal.threshold)}×`;
    case "plato":
      return `≤ ${formatViews(signal.threshold)} views`;
    case "cauda":
      return `≥ ${formatPercent(signal.threshold, 0)}`;
    default:
      return `≤ ${formatPercent(signal.threshold, 0)}`;
  }
}

function signalsTable(result: ClassificationResult): string {
  const rows = result.signals.map((signal) => {
    const hours =
      signal.start_hour === null
        ? "—"
        : signal.start_hour === signal.end_hour
          ? `${signal.start_hour}`
          : `${signal.start_hour}–${signal.end_hour}`;
    return `| ${signal.label} | ${signal.active ? "sim" : "não"} | ${signalValue(signal)} | ${signalThreshold(signal)} | ${hours} |`;
  });
  return ["| Sinal | Ativo | Valor | Limite | Horas |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");
}

function exampleSection(example: Example, options: { json?: boolean } = {}): string {
  const result = classify(example.views);
  const parts = [
    `#### ${example.title}: \`${result.classification}\``,
    "",
    `${example.description} Série de ${example.views.length} horas:`,
    "",
    "```text",
    sparkline(example.views),
    "```",
    "",
    `> ${result.reason}`,
    "",
    signalsTable(result),
  ];
  if (options.json) {
    parts.push(
      "",
      "<details><summary>Resposta completa da API</summary>",
      "",
      "```json",
      JSON.stringify(result, null, 2),
      "```",
      "",
      "</details>",
    );
  }
  return parts.join("\n");
}

function rulesBlock(rules: Rules): string {
  const r = rules;
  const rows = [
    [
      "Ritmo anterior",
      `Mediana das até ${r.baseline.windowHours} horas antes do evento (mínimo de ${r.baseline.minHours}). Nas razões, o ritmo anterior nunca vale menos que ${r.baseline.floorPerHour} views/h.`,
      `O evento começa antes da ${r.baseline.minHours + 1}ª hora`,
    ],
    [
      "Salto",
      `Pico ≥ ${r.jump.minRatio} × o ritmo anterior e ≥ ${formatViews(r.jump.minPeakViews)} views. O evento vai da primeira hora que salta até a última com pelo menos ${formatPercent(r.event.endFractionOfPeak, 0)} do pico.`,
      "Sem ritmo anterior",
    ],
    [
      "Trecho com views fixas",
      `${r.plateau.minHours} horas ou mais, média ≥ ${formatViews(r.plateau.minMeanViews)} views/h, cada hora a até ${r.stableRun.toleranceSqrt}·√mediana da mediana do trecho, e variação típica de uma hora para a outra ≤ ${String(r.plateau.chanceFactor).replace(".", ",")}·√média. Variação típica: média das diferenças entre horas seguidas, descartando a maior. Medida no trecho inteiro, nunca na melhor janela dentro dele.`,
      `Nenhum trecho estável com ${r.plateau.minHours} horas`,
    ],
    [
      "Volta brusca ao ritmo anterior",
      `Em até ${r.drop.withinHours} horas depois do evento, ${r.drop.holdHours} horas seguidas com no máximo ${formatPercent(r.drop.maxRemainingExcess, 0)} do excesso sobre o ritmo anterior (sem ritmo anterior: ${formatPercent(r.drop.maxRemainingExcess, 0)} do nível do evento).`,
      `A série termina antes de ${r.drop.holdHours} horas depois do evento`,
    ],
    [
      "Cauda (informativo)",
      `Mediana das ${r.tail.hours} horas depois do pico ≥ ${formatPercent(r.tail.minRetention, 0)} do pico. Explica um pico sem acusação; não decide sozinho.`,
      `Menos de ${r.tail.hours} horas depois do pico`,
    ],
    [
      "Desenho repetido",
      `Desenho de ${r.repetition.minPeriodHours} a ${r.repetition.maxPeriodHours} horas repetido ${r.repetition.minRepetitions} vezes seguidas ou mais, pulso (maior − menor hora do desenho) ≥ ${formatViews(r.repetition.minAmplitudeViews)} views, contraste ≥ ${r.repetition.minContrast}× e, em cada hora do desenho, diferença média entre as repetições ≤ ${formatPercent(r.repetition.maxRelativeError, 0)} da altura do pulso.`,
      "—",
    ],
    ["Série curta", `Menos de ${r.minSeriesHours} horas.`, "—"],
  ];
  return [
    `_Gerado a partir de \`src/classifier/rules.ts\` (regras ${r.version}) por \`npm run evaluate -- --write-readme\`._`,
    "",
    "| Sinal | Ativa quando | Indisponível quando |",
    "| --- | --- | --- |",
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function familiesBlock(): string {
  const rows = FAMILIES.map(
    (family) =>
      `| ${family.title} | ${family.label === "legitimo" ? "Legítima" : "Artificial"} | ${family.shape} | ` +
      `${family.expected
        .split(" ou ")
        .map((name) => `\`${name}\``)
        .join(" ou ")} | ${family.role} |`,
  );
  return [
    "| Família | Origem | Desenho | Esperado (hipótese) | Papel |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function count(value: number): string {
  return integer.format(value);
}

function rateCell(rate: Rate): string {
  if (rate.denominator === 0) return "— | —";
  return (
    `${count(rate.numerator)} de ${count(rate.denominator)} (${formatPercent(rate.value, 2)}) | ` +
    `${formatPercent(rate.low, 2)} a ${formatPercent(rate.high, 2)}`
  );
}

function falsePositiveSources(metrics: Metrics): string {
  const sources = FAMILIES.filter(
    (family) => family.label === "legitimo" && metrics.byFamily[family.name].suspeito > 0,
  ).map((family) => `${family.title} (${count(metrics.byFamily[family.name].suspeito)})`);
  return sources.length === 0 ? "nenhuma" : sources.join(", ");
}

function metricsBlock(manifest: Manifest, metrics: Metrics, stress: Metrics, rules: Rules): string {
  const families = Object.keys(manifest.families).length;
  const falsePositive = metrics.falsePositive;
  const familyRows = FAMILIES.map((family) => {
    const counts = metrics.byFamily[family.name];
    return `| ${family.title} | ${family.label === "legitimo" ? "Legítima" : "Artificial"} | ${CLASSES.map((name) => count(counts[name])).join(" | ")} |`;
  });
  return [
    GENERATED,
    "",
    `Dataset de avaliação: ${count(manifest.total_series)} séries (${families} famílias × ${manifest.series_per_family}), ` +
      `seed ${manifest.seed}, gerador ${manifest.generator_version}, SHA-256 \`${manifest.sha256.slice(0, 16)}\`. ` +
      `Regras ${rules.version}.`,
    "",
    `**Taxa de falso positivo: ${count(falsePositive.numerator)} de ${count(falsePositive.denominator)} séries legítimas ` +
      `classificadas como \`suspeito\` (${formatPercent(falsePositive.value, 2)}; IC 95%: ${formatPercent(falsePositive.low, 2)} ` +
      `a ${formatPercent(falsePositive.high, 2)}).**`,
    "",
    "| Métrica | Resultado | IC 95% (Wilson) |",
    "| --- | --- | --- |",
    `| Falso positivo: legítimas classificadas como \`suspeito\` | ${rateCell(metrics.falsePositive)} |`,
    `| Legítimas classificadas como \`inconclusivo\` | ${rateCell(metrics.legitimateInconclusive)} |`,
    `| Falso positivo pessimista: legítimas \`suspeito\` ou \`inconclusivo\` | ${rateCell(metrics.pessimisticFalsePositive)} |`,
    `| Detecção: artificiais classificadas como \`suspeito\` | ${rateCell(metrics.detection)} |`,
    `| Precisão: entre as \`suspeito\`, quantas eram artificiais | ${rateCell(metrics.precision)} |`,
    `| Falso positivo no estresse: legítimas com ruído de Poisson puro | ${rateCell(stress.falsePositive)} |`,
    "",
    "| Família | Origem | `sem_indicios` | `inconclusivo` | `suspeito` |",
    "| --- | --- | --- | --- | --- |",
    ...familyRows,
    "",
    `Falsos positivos por família: ${falsePositiveSources(metrics)}.`,
  ].join("\n");
}

export function renderBlocks(manifest: Manifest, metrics: Metrics, stress: Metrics, rules: Rules = RULES): Record<BlockName, string> {
  const wrap = (content: string) => `\n${content}\n`;
  return {
    regras: wrap(rulesBlock(rules)),
    "organico-x-comprado": wrap(
      [GENERATED, "", exampleSection(EXAMPLES.organic), "", exampleSection(EXAMPLES.bought)].join("\n"),
    ),
    abstencao: wrap([GENERATED, "", exampleSection(EXAMPLES.burst, { json: true })].join("\n")),
    familias: wrap(familiesBlock()),
    metricas: wrap(metricsBlock(manifest, metrics, stress, rules)),
  };
}
