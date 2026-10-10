export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("mediana de lista vazia");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error("média de lista vazia");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Variação típica de uma hora para a seguinte: média de |x[t+1] − x[t]|, descartando
// a maior delas. Descartar uma tolera um degrau isolado (hora parcial no começo ou no
// fim de um trecho); diferenças entre horas seguidas não são afetadas por tendência lenta.
export function typicalChange(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const changes: number[] = [];
  for (let index = 1; index < values.length; index++) {
    changes.push(Math.abs(values[index] - values[index - 1]));
  }
  if (changes.length >= 3) {
    changes.sort((a, b) => a - b);
    changes.pop();
  }
  return mean(changes);
}

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
