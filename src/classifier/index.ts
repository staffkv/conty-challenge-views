import { analyze } from "./analyze.ts";
import { explain } from "./explain.ts";
import { RULES, type Rules } from "./rules.ts";
import { buildEventSummary, buildSignals } from "./signals.ts";
import type { ClassificationResult } from "./types.ts";

// Função pura: mesma série e mesmas regras, mesma resposta. Não altera `views`.
export function classify(views: readonly number[], rules: Rules = RULES): ClassificationResult {
  const analysis = analyze(views, rules);
  return {
    classification: analysis.classification,
    reason: explain(analysis, views, rules),
    event: buildEventSummary(analysis, views),
    signals: buildSignals(analysis, rules),
    rules_version: rules.version,
  };
}

export { RULES, type Rules } from "./rules.ts";
export type { Classification, ClassificationResult, EventSummary, Signal, SignalCode } from "./types.ts";
