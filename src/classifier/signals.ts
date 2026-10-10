import type { Analysis, AnalyzedEvent, PlateauCheck, SeriesOverview } from "./analyze.ts";
import type { Repetition } from "./events.ts";
import { hourNumber, hoursCount, ordinalHour } from "./format.ts";
import type { Rules } from "./rules.ts";
import { round } from "./stats.ts";
import type { EventSummary, Signal } from "./types.ts";

const LABELS = {
  serie_curta: "Série curta",
  salto: "Salto sobre o ritmo anterior",
  plato: "Trecho com views fixas",
  queda: "Volta brusca ao ritmo anterior",
  cauda: "Cauda depois do pico",
  repeticao: "Desenho repetido",
} as const;

const UNITS = {
  serie_curta: "horas na série",
  salto: "vezes o ritmo anterior",
  plato: "views de variação típica entre horas seguidas",
  queda: "fração do excesso que sobrou",
  cauda: "fração do pico mantida nas horas seguintes",
  repeticao: "maior diferença média entre repetições, em fração da altura do pulso",
} as const;

function missing(code: Exclude<Signal["code"], "serie_curta">, note: string): Signal {
  return {
    code,
    label: LABELS[code],
    active: false,
    value: null,
    threshold: null,
    unit: UNITS[code],
    start_hour: null,
    end_hour: null,
    note,
    details: null,
  };
}

function plateauSignal(plateau: PlateauCheck): Signal {
  const note = plateau.active
    ? "Variação menor que a metade da que o acaso produziria nesse volume."
    : "Variação compatível com público real nesse volume.";
  return {
    code: "plato",
    label: LABELS.plato,
    active: plateau.active,
    value: round(plateau.change, 2),
    threshold: round(plateau.threshold, 2),
    unit: UNITS.plato,
    start_hour: hourNumber(plateau.run.start),
    end_hour: hourNumber(plateau.run.end),
    note,
    details: {
      mean_per_hour: round(plateau.meanPerHour, 1),
      lowest: plateau.low,
      highest: plateau.high,
      chance_change: round(plateau.chanceChange, 2),
    },
  };
}

function eventSignals(event: AnalyzedEvent, rules: Rules): Signal[] {
  const jump: Signal =
    event.jump === null
      ? missing(
          "salto",
          `O evento começa na ${ordinalHour(event.start)}; são necessárias ${rules.baseline.minHours} horas antes dele ` +
            `para medir o ritmo anterior.`,
        )
      : {
          code: "salto",
          label: LABELS.salto,
          active: event.jumpActive,
          value: round(event.jump, 3),
          threshold: rules.jump.minRatio,
          unit: UNITS.salto,
          start_hour: hourNumber(event.start),
          end_hour: hourNumber(event.end),
          note: null,
          details: {
            peak_hour: hourNumber(event.peak),
            peak_views: event.peakViews,
            baseline_per_hour: round(event.baseline!.perHour, 1),
          },
        };

  const plateau =
    event.plateau !== null
      ? plateauSignal(event.plateau)
      : missing(
          "plato",
          `Nenhum trecho de ${rules.plateau.minHours} horas ou mais com volume estável dentro do evento.`,
        );

  const drop: Signal = event.drop.available
    ? {
        code: "queda",
        label: LABELS.queda,
        active: event.drop.active,
        value: round(event.drop.remaining!, 4),
        threshold: rules.drop.maxRemainingExcess,
        unit: event.drop.reference === "ritmo_anterior" ? UNITS.queda : "fração do nível do evento que sobrou",
        start_hour: hourNumber(event.drop.from!),
        end_hour: hourNumber(event.drop.to!),
        note: null,
        details: { settled_per_hour: round(event.drop.settledPerHour!, 1) },
      }
    : missing(
        "queda",
        `A série termina ${hoursCount(event.drop.observedHours)} depois do evento; são necessárias ` +
          `${rules.drop.holdHours} para avaliar a volta ao ritmo anterior.`,
      );

  const tail: Signal =
    event.tail === null
      ? missing("cauda", "Não se aplica a um trecho fixo sem pico.")
      : event.tail.retention === null
        ? missing("cauda", `A série termina antes de ${rules.tail.hours} horas depois do pico.`)
        : {
            code: "cauda",
            label: LABELS.cauda,
            active: event.tail.active,
            value: round(event.tail.retention, 4),
            threshold: rules.tail.minRetention,
            unit: UNITS.cauda,
            start_hour: hourNumber(event.peak + 1),
            end_hour: hourNumber(event.peak + rules.tail.hours),
            note: "Informativo: ajuda a explicar um pico sem acusação, mas não decide sozinho.",
            details: { recovery_hours: event.tail.recoveryHours },
          };

  return [jump, plateau, drop, tail];
}

function overviewSignals(overview: SeriesOverview, rules: Rules): Signal[] {
  const jump: Signal =
    overview.maxJump === null
      ? missing("salto", "Nenhuma hora tem as 6 horas anteriores necessárias para medir o ritmo anterior.")
      : {
          code: "salto",
          label: LABELS.salto,
          active: false,
          value: round(overview.maxJump.ratio, 3),
          threshold: rules.jump.minRatio,
          unit: UNITS.salto,
          start_hour: hourNumber(overview.maxJump.index),
          end_hour: hourNumber(overview.maxJump.index),
          note: `Maior subida da série; nenhuma hora chegou a ${rules.jump.minRatio} vezes o ritmo anterior com pelo menos ${rules.jump.minPeakViews} views.`,
          details: null,
        };
  const plateau =
    overview.longestCandidate !== null
      ? plateauSignal(overview.longestCandidate)
      : missing(
          "plato",
          `Nenhum trecho de ${rules.plateau.minHours} horas ou mais com volume estável e média de pelo menos ` +
            `${rules.plateau.minMeanViews} views por hora.`,
        );
  const nothing = "Sem pico ou trecho fixo para avaliar.";
  return [jump, plateau, missing("queda", nothing), missing("cauda", nothing)];
}

function repetitionSignal(repetition: Repetition | null, rules: Rules): Signal {
  const limits = rules.repetition;
  if (repetition === null) {
    return missing(
      "repeticao",
      `Nenhum desenho de ${limits.minPeriodHours} a ${limits.maxPeriodHours} horas se repetiu ${limits.minRepetitions} ` +
        `vezes seguidas com pulso de pelo menos ${limits.minAmplitudeViews} views e contraste de ${limits.minContrast} vezes.`,
    );
  }
  return {
    code: "repeticao",
    label: LABELS.repeticao,
    active: true,
    value: round(repetition.relativeError, 4),
    threshold: limits.maxRelativeError,
    unit: UNITS.repeticao,
    start_hour: hourNumber(repetition.start),
    end_hour: hourNumber(repetition.end),
    note: repetition.zerosBetween
      ? "Zero exato entre os pulsos: também é o desenho de um contador atualizado em lotes."
      : null,
    details: {
      period_hours: repetition.period,
      repetitions: repetition.repetitions,
      typical_block: repetition.typicalBlock.join(", "),
      pulse_height: repetition.amplitude,
      contrast: round(repetition.contrast, 1),
      zeros_between: repetition.zerosBetween ? "sim" : "nao",
    },
  };
}

export function buildSignals(analysis: Analysis, rules: Rules): Signal[] {
  const short: Signal = {
    code: "serie_curta",
    label: LABELS.serie_curta,
    active: analysis.hours < rules.minSeriesHours,
    value: analysis.hours,
    threshold: rules.minSeriesHours,
    unit: UNITS.serie_curta,
    start_hour: 1,
    end_hour: analysis.hours,
    note:
      analysis.hours < rules.minSeriesHours
        ? `Com menos de ${rules.minSeriesHours} horas os outros sinais não são avaliados.`
        : null,
    details: null,
  };
  if (analysis.path === "serie_curta") {
    const note = `Não avaliado: a série tem menos de ${rules.minSeriesHours} horas.`;
    return [short, ...(["salto", "plato", "queda", "cauda", "repeticao"] as const).map((code) => missing(code, note))];
  }
  const middle =
    analysis.decisive !== null
      ? eventSignals(analysis.decisive, rules)
      : analysis.path === "repeticao" || analysis.path === "pulsos_com_zeros"
        ? (["salto", "plato", "queda", "cauda"] as const).map((code) =>
            missing(code, "A decisão veio do desenho repetido; veja o sinal de repetição."),
          )
        : overviewSignals(analysis.overview, rules);
  return [short, ...middle, repetitionSignal(analysis.repetition, rules)];
}

export function buildEventSummary(analysis: Analysis, views: readonly number[]): EventSummary | null {
  const event = analysis.decisive;
  if (event !== null) {
    return {
      kind: event.kind,
      start_hour: hourNumber(event.start),
      end_hour: hourNumber(event.end),
      peak_hour: hourNumber(event.peak),
      peak_views: event.peakViews,
      baseline_per_hour: event.baseline === null ? null : round(event.baseline.perHour, 1),
      excess_views: event.excessViews === null ? null : Math.round(event.excessViews),
    };
  }
  const repetition = analysis.repetition;
  if ((analysis.path === "repeticao" || analysis.path === "pulsos_com_zeros") && repetition !== null) {
    let peak = repetition.start;
    for (let index = repetition.start; index <= repetition.end; index++) if (views[index] > views[peak]) peak = index;
    return {
      kind: "repeticao",
      start_hour: hourNumber(repetition.start),
      end_hour: hourNumber(repetition.end),
      peak_hour: hourNumber(peak),
      peak_views: views[peak],
      baseline_per_hour: null,
      excess_views: null,
    };
  }
  return null;
}
