// Todos os limiares do classificador ficam aqui. Mudou um número, sobe a versão:
// a versão sai em toda resposta da API e no bloco de métricas do README.

export interface Rules {
  version: string;
  minSeriesHours: number;
  baseline: {
    windowHours: number;
    minHours: number;
    floorPerHour: number;
  };
  jump: {
    minRatio: number;
    minPeakViews: number;
  };
  event: {
    endFractionOfPeak: number;
  };
  stableRun: {
    toleranceSqrt: number;
  };
  plateau: {
    minHours: number;
    minMeanViews: number;
    chanceFactor: number;
  };
  drop: {
    withinHours: number;
    holdHours: number;
    maxRemainingExcess: number;
  };
  tail: {
    hours: number;
    minRetention: number;
    recoveryMultiple: number;
  };
  repetition: {
    minPeriodHours: number;
    maxPeriodHours: number;
    minRepetitions: number;
    minAmplitudeViews: number;
    minContrast: number;
    maxRelativeError: number;
  };
}

export const RULES: Rules = {
  version: "1.0.0",
  // Abaixo disso não há como comparar o ritmo antes e depois de um evento.
  minSeriesHours: 24,
  baseline: {
    // Ritmo anterior: mediana das até 12 horas antes do evento.
    windowHours: 12,
    minHours: 6,
    // Piso no denominador: evita que 0 → 3 views vire um salto "infinito"
    // sem deixar de enxergar um criador pequeno que compra milhares de views.
    floorPerHour: 20,
  },
  jump: {
    minRatio: 8,
    minPeakViews: 200,
  },
  event: {
    // O evento termina quando as views ficam abaixo da metade do pico.
    endFractionOfPeak: 0.5,
  },
  stableRun: {
    // Trecho estável: cada hora a até 2·√mediana da mediana do trecho.
    toleranceSqrt: 2,
  },
  plateau: {
    minHours: 6,
    minMeanViews: 200,
    // Acessos independentes variam de uma hora para a outra cerca de √média views,
    // mesmo com público estável; público real varia mais. "Regular demais" é ficar
    // abaixo de metade disso. Um limite fixo em % puniria vídeo que estourou: com
    // 20 mil views/h, o próprio acaso varia menos de 1%.
    chanceFactor: 0.5,
  },
  drop: {
    // Em até 2 horas depois do evento, 3 horas seguidas com no máximo
    // 10% do excesso sobre o ritmo anterior.
    withinHours: 2,
    holdHours: 3,
    maxRemainingExcess: 0.1,
  },
  tail: {
    // Informativo: quanto do pico continua nas 3 horas seguintes.
    hours: 3,
    minRetention: 0.25,
    recoveryMultiple: 2,
  },
  repetition: {
    // Desenho de 2 a 6 horas repetido ao menos 4 vezes seguidas. A altura do pulso
    // (maior − menor hora do desenho) precisa ter 200 views ou mais, e em cada hora do
    // desenho as repetições diferem em média no máximo 5% dessa altura.
    minPeriodHours: 2,
    maxPeriodHours: 6,
    minRepetitions: 4,
    minAmplitudeViews: 200,
    minContrast: 5,
    maxRelativeError: 0.05,
  },
};
