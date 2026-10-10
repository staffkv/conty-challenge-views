export type Classification = "sem_indicios" | "inconclusivo" | "suspeito";

export type SignalCode = "serie_curta" | "salto" | "plato" | "queda" | "cauda" | "repeticao";

// Horas na resposta começam em 1: hora 1 é a primeira posição de `views`.
export interface Signal {
  code: SignalCode;
  label: string;
  active: boolean;
  value: number | null;
  threshold: number | null;
  unit: string;
  start_hour: number | null;
  end_hour: number | null;
  note: string | null;
  details: Record<string, number | string | null> | null;
}

export interface EventSummary {
  kind: "pico" | "trecho_fixo" | "repeticao";
  start_hour: number;
  end_hour: number;
  peak_hour: number;
  peak_views: number;
  baseline_per_hour: number | null;
  excess_views: number | null;
}

export interface ClassificationResult {
  classification: Classification;
  reason: string;
  event: EventSummary | null;
  signals: Signal[];
  rules_version: string;
}
