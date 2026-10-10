import type { Analysis, AnalyzedEvent, DropCheck } from "./analyze.ts";
import type { Repetition } from "./events.ts";
import {
  formatPercent,
  formatTimes,
  formatViews,
  hourNumber,
  hourSpan,
  hoursCount,
  listInPortuguese,
  ordinalHour,
} from "./format.ts";
import type { Rules } from "./rules.ts";

// Motivos montados a partir dos mesmos números que saem nos sinais.
// Regra de redação: nada de nomes de sinais, siglas ou fórmulas no texto.

const NOT_PROOF =
  "Isso não prova que as views são humanas; as regras apenas não encontraram sinais de entrega mecânica.";

// "20 vezes o ritmo anterior de 250 por hora". Quando o ritmo anterior fica abaixo do piso
// (por exemplo, zero), a razão é calculada sobre o piso e o texto diz isso.
function jumpPhrase(event: AnalyzedEvent, rules: Rules): string {
  const baseline = event.baseline!.perHour;
  if (baseline < rules.baseline.floorPerHour) {
    return (
      `${formatTimes(event.jump!)} vezes o mínimo de referência de ${rules.baseline.floorPerHour} por hora ` +
      `(o ritmo anterior era de ${formatViews(baseline)} por hora)`
    );
  }
  return `${formatTimes(event.jump!)} vezes o ritmo anterior de ${formatViews(baseline)} por hora`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function returnMoment(event: AnalyzedEvent, drop: DropCheck): string {
  return drop.from === event.end + 1 ? "na hora seguinte" : "em até duas horas";
}

function regularityExplanation(event: AnalyzedEvent): string {
  const plateau = event.plateau!;
  return (
    `Nesse volume, acessos independentes variariam cerca de ${formatViews(plateau.chanceChange)} views ` +
    `de uma hora para a outra; aqui a variação típica foi de ${formatViews(plateau.change)}.`
  );
}

function fixedStretch(event: AnalyzedEvent): string {
  const plateau = event.plateau!;
  const range =
    plateau.low === plateau.high
      ? `todas as horas com ${formatViews(plateau.low)}`
      : `de ${formatViews(plateau.low)} a ${formatViews(plateau.high)}`;
  return (
    `${capitalize(hourSpan(plateau.run.start, plateau.run.end))}, as views ficaram praticamente fixas em cerca de ` +
    `${formatViews(event.level)} por hora (${range})`
  );
}

function packageReason(event: AnalyzedEvent, rules: Rules): string {
  const drop = event.drop;
  const parts = [
    `${fixedStretch(event)}.`,
    `Antes, o ritmo era de ${formatViews(event.baseline!.perHour)} por hora: um salto de ${formatTimes(event.jump!)} vezes` +
      (event.baseline!.perHour < rules.baseline.floorPerHour
        ? ` sobre o mínimo de referência de ${rules.baseline.floorPerHour} por hora.`
        : "."),
    `${capitalize(returnMoment(event, drop))}, as views voltaram a ${formatViews(drop.settledPerHour!)} por hora e ficaram assim.`,
    regularityExplanation(event),
    `O desenho é típico de entrega programada e merece revisão: são cerca de ${formatViews(event.excessViews ?? 0)} views ` +
      `acima do ritmo normal nesse trecho.`,
  ];
  return parts.join(" ");
}

function withoutBaselineReason(event: AnalyzedEvent): string {
  const drop = event.drop;
  const after = drop.active
    ? ` Depois, caíram para ${formatViews(drop.settledPerHour!)} por hora.`
    : !drop.available
      ? " O trecho vai até o fim da série."
      : "";
  const where =
    event.plateau!.run.start === 0 ? "logo na primeira hora da série" : `na ${ordinalHour(event.plateau!.run.start)}, cedo demais na série`;
  return (
    `${fixedStretch(event)}, mais regulares do que o acaso produziria.${after} ` +
    `Como esse trecho começa ${where}, não há ritmo anterior para comparar: pode ser compra, mas também ` +
    `impulsionamento pago com entrega constante. O classificador prefere não acusar.`
  );
}

function withoutJumpReason(event: AnalyzedEvent, rules: Rules): string {
  const comparison =
    event.jump! < 1
      ? `mas esse nível ficou abaixo do ritmo anterior (${formatViews(event.baseline!.perHour)} por hora)`
      : `mas esse nível ficou só ${formatTimes(event.jump!)} vezes o ritmo anterior ` +
        `(${formatViews(event.baseline!.perHour)} por hora), abaixo do salto de ${rules.jump.minRatio} vezes que o critério exige`;
  return (
    `${fixedStretch(event)}, ${comparison}. ` +
    `Sem um salto claro, a regularidade sozinha não basta para acusar: pode ser um ritmo de entrega constante. ` +
    `O classificador prefere não acusar.`
  );
}

function withoutDropReason(event: AnalyzedEvent): string {
  const drop = event.drop;
  const ending = !drop.available
    ? drop.observedHours === 0
      ? "A série termina com o volume ainda alto, antes de mostrar o que acontece em seguida."
      : `A série termina ${hoursCount(drop.observedHours)} depois, antes de mostrar o que acontece em seguida.`
    : "Depois, o volume diminuiu sem voltar de uma vez ao ritmo anterior.";
  return (
    `${capitalize(hourSpan(event.plateau!.run.start, event.plateau!.run.end))}, as views saltaram ` +
    `${formatTimes(event.jump!)} vezes sobre o ritmo anterior (${formatViews(event.baseline!.perHour)} por hora) e ficaram ` +
    `praticamente fixas em cerca de ${formatViews(event.level)} por hora. ${ending} ` +
    `Sem o desligamento brusco, não dá para separar uma compra de uma campanha que continua; o classificador prefere não acusar.`
  );
}

function spikeOpening(event: AnalyzedEvent, rules: Rules): string {
  if (event.start === event.end) {
    return `Na ${ordinalHour(event.peak)}, as views saltaram para ${formatViews(event.peakViews)}, ${jumpPhrase(event, rules)}`;
  }
  return (
    `${capitalize(hourSpan(event.start, event.end))}, as views saltaram para até ${formatViews(event.peakViews)} por hora ` +
    `(pico na ${ordinalHour(event.peak)}), ${jumpPhrase(event, rules)}`
  );
}

function burstReason(event: AnalyzedEvent, rules: Rules): string {
  return (
    `${spikeOpening(event, rules)}, e voltaram ao patamar de antes ${returnMoment(event, event.drop)}. ` +
    `Esse desenho aparece tanto em compra rápida quanto em uma menção pontual, como uma live ou um compartilhamento grande. ` +
    `Sem trecho fixo nem repetição, não há evidência suficiente para acusar.`
  );
}

function cutAtEndReason(event: AnalyzedEvent, hours: number, rules: Rules): string {
  const ending =
    event.end === hours - 1
      ? "a série termina com o volume ainda alto"
      : `a série termina ${hoursCount(event.drop.observedHours)} depois`;
  return (
    `${spikeOpening(event, rules)}, mas ${ending}. Sem ver o que acontece depois, não dá para saber se o volume cairia ` +
    `aos poucos ou de uma vez; o classificador prefere não acusar.`
  );
}

function tailReason(event: AnalyzedEvent, rules: Rules): string {
  const tail = event.tail!;
  const opening = `Na ${ordinalHour(event.peak)} houve um pico de ${formatViews(event.peakViews)} views, ${jumpPhrase(event, rules)}`;
  if (tail.active) {
    const recovery =
      tail.recoveryHours !== null
        ? `, e o volume só voltou para perto do ritmo anterior ${hoursCount(tail.recoveryHours)} depois do pico`
        : ", e o volume ainda não tinha voltado ao ritmo anterior no fim da série";
    return (
      `${opening}, mas a queda foi gradual: nas ${rules.tail.hours} horas seguintes ainda havia ` +
      `${formatPercent(tail.retention!, 0)} do pico${recovery}. Esse desenho é compatível com viralização. ${NOT_PROOF}`
    );
  }
  return (
    `${opening}. Depois do pico o volume caiu, mas não ficou ${rules.drop.holdHours} horas seguidas de volta ao ritmo ` +
    `anterior, como acontece quando uma entrega é desligada. Sem trecho fixo, repetição ou desligamento brusco, ` +
    `não há sinal de entrega mecânica. ${NOT_PROOF}`
  );
}

function repetitionOpening(repetition: Repetition): string {
  const shape = `${listInPortuguese(repetition.typicalBlock.map(formatViews))} views`;
  return (
    `Da ${hourNumber(repetition.start)}ª à ${ordinalHour(repetition.end)}, o mesmo desenho de ${repetition.period} horas ` +
    `(${shape}) se repetiu ${repetition.repetitions} vezes seguidas`
  );
}

function repetitionReason(repetition: Repetition): string {
  return (
    `${repetitionOpening(repetition)}, e cada hora do desenho variou em média no máximo ` +
    `${formatPercent(repetition.relativeError, repetition.relativeError < 0.01 ? 2 : 1)} da altura do pulso entre uma ` +
    `repetição e outra. Audiência humana não ` +
    `produz pulsos tão iguais em intervalos tão curtos. O padrão é típico de entrega programada e merece revisão.`
  );
}

function zerosBetweenReason(repetition: Repetition): string {
  return (
    `${repetitionOpening(repetition)}, com zero exato entre os pulsos. Esse desenho aparece em entrega programada, ` +
    `mas também quando a plataforma só atualiza o contador a cada ${repetition.period} horas e as views de várias horas ` +
    `aparecem de uma vez. O classificador prefere não acusar.`
  );
}

function nothingReason(analysis: Analysis, views: readonly number[], rules: Rules): string {
  if (Math.max(...views) < rules.jump.minPeakViews) {
    return (
      `O volume ficou abaixo de ${rules.jump.minPeakViews} views por hora em toda a série, pequeno demais para os ` +
      `critérios de salto, trecho fixo e repetição. ${NOT_PROOF}`
    );
  }
  const maxJump = analysis.overview.maxJump;
  const highest =
    maxJump !== null
      ? ` (a maior subida foi de ${formatTimes(maxJump.ratio)} vezes, na ${ordinalHour(maxJump.index)})`
      : "";
  return (
    `Nenhum dos padrões procurados apareceu: não houve salto de ${rules.jump.minRatio} vezes ou mais sobre o ritmo ` +
    `anterior${highest}, nem trecho com views fixas, nem desenho repetido. ${NOT_PROOF}`
  );
}

export function explain(analysis: Analysis, views: readonly number[], rules: Rules): string {
  const event = analysis.decisive;
  switch (analysis.path) {
    case "serie_curta":
      return (
        `A série tem só ${hoursCount(analysis.hours)}. Para comparar o ritmo antes e depois de um pico são necessárias ` +
        `pelo menos ${rules.minSeriesHours} horas; com menos que isso, o classificador prefere não acusar.`
      );
    case "repeticao":
      return repetitionReason(analysis.repetition!);
    case "pulsos_com_zeros":
      return zerosBetweenReason(analysis.repetition!);
    case "pacote":
      return packageReason(event!, rules);
    case "trecho_fixo_sem_ritmo_anterior":
      return withoutBaselineReason(event!);
    case "trecho_fixo_sem_salto":
      return withoutJumpReason(event!, rules);
    case "trecho_fixo_sem_queda":
      return withoutDropReason(event!);
    case "rajada":
      return burstReason(event!, rules);
    case "corte_no_fim":
      return cutAtEndReason(event!, analysis.hours, rules);
    case "cauda":
      return tailReason(event!, rules);
    case "nada":
      return nothingReason(analysis, views, rules);
  }
}
