import {
  baselineBefore,
  findRepetition,
  findSpikes,
  findStableRuns,
  jumpRatio,
  runLength,
  type Baseline,
  type Repetition,
  type Run,
  type Spike,
} from "./events.ts";
import type { Rules } from "./rules.ts";
import { mean, median, typicalChange } from "./stats.ts";
import type { Classification } from "./types.ts";

export interface PlateauCheck {
  run: Run;
  meanPerHour: number;
  low: number;
  high: number;
  change: number;
  chanceChange: number;
  threshold: number;
  active: boolean;
}

export interface DropCheck {
  available: boolean;
  observedHours: number;
  reference: "ritmo_anterior" | "nivel_do_evento";
  remaining: number | null;
  settledPerHour: number | null;
  from: number | null;
  to: number | null;
  active: boolean;
}

export interface TailCheck {
  retention: number | null;
  recoveryHours: number | null;
  active: boolean;
}

export type DecisionPath =
  | "serie_curta"
  | "pacote"
  | "repeticao"
  | "pulsos_com_zeros"
  | "trecho_fixo_sem_ritmo_anterior"
  | "trecho_fixo_sem_salto"
  | "trecho_fixo_sem_queda"
  | "rajada"
  | "corte_no_fim"
  | "cauda"
  | "nada";

export interface AnalyzedEvent {
  kind: "pico" | "trecho_fixo";
  start: number;
  end: number;
  peak: number;
  peakViews: number;
  level: number;
  baseline: Baseline | null;
  jump: number | null;
  jumpActive: boolean;
  plateau: PlateauCheck | null;
  drop: DropCheck;
  tail: TailCheck | null;
  excessViews: number | null;
  classification: Classification;
  path: DecisionPath;
}

export interface SeriesOverview {
  maxJump: { ratio: number; index: number } | null;
  longestCandidate: PlateauCheck | null;
}

export interface Analysis {
  hours: number;
  classification: Classification;
  path: DecisionPath;
  decisive: AnalyzedEvent | null;
  repetition: Repetition | null;
  events: AnalyzedEvent[];
  overview: SeriesOverview;
}

const SEVERITY: Record<Classification, number> = { sem_indicios: 1, inconclusivo: 2, suspeito: 3 };

function plateauCandidates(views: readonly number[], rules: Rules): Run[] {
  return findStableRuns(views, rules).filter(
    (run) =>
      runLength(run) >= rules.plateau.minHours &&
      mean(views.slice(run.start, run.end + 1)) >= rules.plateau.minMeanViews,
  );
}

export function checkPlateau(views: readonly number[], run: Run, rules: Rules): PlateauCheck {
  const values = views.slice(run.start, run.end + 1);
  const meanPerHour = mean(values);
  const change = typicalChange(values);
  const chanceChange = Math.sqrt(meanPerHour);
  const threshold = rules.plateau.chanceFactor * chanceChange;
  const longEnough = values.length >= rules.plateau.minHours && meanPerHour >= rules.plateau.minMeanViews;
  return {
    run,
    meanPerHour,
    low: Math.min(...values),
    high: Math.max(...values),
    change,
    chanceChange,
    threshold,
    active: longEnough && change <= threshold,
  };
}

export function checkDrop(
  views: readonly number[],
  end: number,
  level: number,
  baseline: Baseline | null,
  rules: Rules,
): DropCheck {
  const observedHours = views.length - 1 - end;
  const reference = baseline !== null && level > baseline.perHour ? baseline.perHour : null;
  const referenceKind = reference !== null ? "ritmo_anterior" : "nivel_do_evento";
  const unavailable: DropCheck = {
    available: false,
    observedHours,
    reference: referenceKind,
    remaining: null,
    settledPerHour: null,
    from: null,
    to: null,
    active: false,
  };
  if (observedHours < rules.drop.holdHours) return unavailable;

  let best: DropCheck | null = null;
  for (let offset = 1; offset <= rules.drop.withinHours; offset++) {
    const from = end + offset;
    const to = from + rules.drop.holdHours - 1;
    if (to >= views.length) break;
    const window = views.slice(from, to + 1);
    const highest = Math.max(...window);
    const remaining = Math.max(
      0,
      reference !== null ? (highest - reference) / (level - reference) : highest / level,
    );
    if (best === null || remaining < (best.remaining ?? Infinity)) {
      best = {
        available: true,
        observedHours,
        reference: referenceKind,
        remaining,
        settledPerHour: median(window),
        from,
        to,
        active: remaining <= rules.drop.maxRemainingExcess,
      };
    }
  }
  return best ?? unavailable;
}

export function checkTail(views: readonly number[], peak: number, baseline: Baseline, rules: Rules): TailCheck {
  const following = views.slice(peak + 1, peak + 1 + rules.tail.hours);
  const retention = following.length === rules.tail.hours && views[peak] > 0 ? median(following) / views[peak] : null;
  const limit = rules.tail.recoveryMultiple * Math.max(baseline.perHour, rules.baseline.floorPerHour);
  let recoveryHours: number | null = null;
  for (let index = peak + 1; index < views.length; index++) {
    if (views[index] <= limit) {
      recoveryHours = index - peak;
      break;
    }
  }
  return { retention, recoveryHours, active: retention !== null && retention >= rules.tail.minRetention };
}

function excessViews(views: readonly number[], start: number, end: number, baseline: Baseline | null): number | null {
  if (baseline === null) return null;
  let total = 0;
  for (let index = start; index <= end; index++) total += Math.max(0, views[index] - baseline.perHour);
  return total;
}

function argmax(views: readonly number[], start: number, end: number): number {
  let best = start;
  for (let index = start + 1; index <= end; index++) if (views[index] > views[best]) best = index;
  return best;
}

function decide(event: Omit<AnalyzedEvent, "classification" | "path">): {
  classification: Classification;
  path: DecisionPath;
} {
  if (event.plateau?.active) {
    if (event.baseline === null) return { classification: "inconclusivo", path: "trecho_fixo_sem_ritmo_anterior" };
    if (!event.jumpActive) return { classification: "inconclusivo", path: "trecho_fixo_sem_salto" };
    if (!event.drop.active) return { classification: "inconclusivo", path: "trecho_fixo_sem_queda" };
    return { classification: "suspeito", path: "pacote" };
  }
  if (!event.drop.available) return { classification: "inconclusivo", path: "corte_no_fim" };
  if (event.drop.active) return { classification: "inconclusivo", path: "rajada" };
  return { classification: "sem_indicios", path: "cauda" };
}

function overlaps(run: Run, start: number, end: number): boolean {
  return run.start <= end && run.end >= start;
}

function spikeEvent(views: readonly number[], spike: Spike, candidates: Run[], used: Set<number>, rules: Rules): AnalyzedEvent {
  let attached: { run: Run; index: number } | null = null;
  candidates.forEach((run, index) => {
    if (!overlaps(run, spike.start, spike.end)) return;
    if (attached === null || runLength(run) > runLength(attached.run)) attached = { run, index };
  });
  const chosen = attached as { run: Run; index: number } | null;
  if (chosen !== null) used.add(chosen.index);

  const plateau = chosen !== null ? checkPlateau(views, chosen.run, rules) : null;
  const start = Math.min(spike.start, chosen?.run.start ?? spike.start);
  const end = Math.max(spike.end, chosen?.run.end ?? spike.end);
  const peak = argmax(views, start, end);
  const level = plateau?.active
    ? median(views.slice(plateau.run.start, plateau.run.end + 1))
    : median(views.slice(spike.start, spike.end + 1));
  const jump = jumpRatio(views[peak], spike.baseline, rules);
  const partial = {
    kind: "pico" as const,
    start,
    end,
    peak,
    peakViews: views[peak],
    level,
    baseline: spike.baseline,
    jump,
    jumpActive: jump >= rules.jump.minRatio,
    plateau,
    drop: checkDrop(views, end, level, spike.baseline, rules),
    tail: checkTail(views, peak, spike.baseline, rules),
    excessViews: excessViews(views, start, end, spike.baseline),
  };
  return { ...partial, ...decide(partial) };
}

function plateauEvent(views: readonly number[], plateau: PlateauCheck, baseline: Baseline | null, rules: Rules): AnalyzedEvent {
  const { start, end } = plateau.run;
  const peak = argmax(views, start, end);
  const level = median(views.slice(start, end + 1));
  const jump = baseline !== null ? jumpRatio(views[peak], baseline, rules) : null;
  const partial = {
    kind: "trecho_fixo" as const,
    start,
    end,
    peak,
    peakViews: views[peak],
    level,
    baseline,
    jump,
    jumpActive: jump !== null && jump >= rules.jump.minRatio && views[peak] >= rules.jump.minPeakViews,
    plateau,
    drop: checkDrop(views, end, level, baseline, rules),
    tail: null,
    excessViews: excessViews(views, start, end, baseline),
  };
  return { ...partial, ...decide(partial) };
}

function overview(views: readonly number[], candidates: Run[], rules: Rules): SeriesOverview {
  let maxJump: SeriesOverview["maxJump"] = null;
  for (let index = 0; index < views.length; index++) {
    const baseline = baselineBefore(views, index, rules);
    if (baseline === null) continue;
    const ratio = jumpRatio(views[index], baseline, rules);
    if (maxJump === null || ratio > maxJump.ratio) maxJump = { ratio, index };
  }
  let longest: Run | null = null;
  for (const run of candidates) if (longest === null || runLength(run) > runLength(longest)) longest = run;
  const longestCandidate = longest !== null ? checkPlateau(views, longest, rules) : null;
  return { maxJump, longestCandidate };
}

function moreRelevant(a: AnalyzedEvent, b: AnalyzedEvent): boolean {
  const severity = SEVERITY[a.classification] - SEVERITY[b.classification];
  if (severity !== 0) return severity > 0;
  const excess = (a.excessViews ?? 0) - (b.excessViews ?? 0);
  if (excess !== 0) return excess > 0;
  return a.start < b.start;
}

export function analyze(views: readonly number[], rules: Rules): Analysis {
  const empty: SeriesOverview = { maxJump: null, longestCandidate: null };
  if (views.length < rules.minSeriesHours) {
    return {
      hours: views.length,
      classification: "inconclusivo",
      path: "serie_curta",
      decisive: null,
      repetition: null,
      events: [],
      overview: empty,
    };
  }

  const candidates = plateauCandidates(views, rules);
  const used = new Set<number>();
  const events = findSpikes(views, rules).map((spike) => spikeEvent(views, spike, candidates, used, rules));
  candidates.forEach((run, index) => {
    if (used.has(index)) return;
    const baseline = baselineBefore(views, run.start, rules);
    const plateau = checkPlateau(views, run, rules);
    if (plateau.active) events.push(plateauEvent(views, plateau, baseline, rules));
  });
  events.sort((a, b) => a.start - b.start);

  let decisive: AnalyzedEvent | null = null;
  for (const event of events) if (decisive === null || moreRelevant(event, decisive)) decisive = event;

  const repetition = findRepetition(views, rules);
  const base = { hours: views.length, repetition, events, overview: overview(views, candidates, rules) };

  if (repetition !== null) {
    // Zero exato entre os pulsos também é o que se vê quando a plataforma só atualiza o
    // contador a cada poucas horas. Nesse caso o desenho repetido não basta para acusar.
    const classification: Classification = repetition.zerosBetween ? "inconclusivo" : "suspeito";
    const path: DecisionPath = repetition.zerosBetween ? "pulsos_com_zeros" : "repeticao";
    const eventWins =
      decisive !== null &&
      (SEVERITY[decisive.classification] > SEVERITY[classification] ||
        (decisive.classification === "suspeito" && classification === "suspeito"));
    if (!eventWins) return { ...base, classification, path, decisive: null };
  }
  if (decisive === null) return { ...base, classification: "sem_indicios", path: "nada", decisive: null };
  return { ...base, classification: decisive.classification, path: decisive.path, decisive };
}
