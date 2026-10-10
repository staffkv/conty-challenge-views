const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function formatViews(value: number): string {
  return integer.format(Math.round(value));
}

// "20 vezes", "8,4 vezes": uma casa só quando o número é pequeno. Arredonda para baixo,
// para que 7,996 vezes não apareça como "8 vezes" ao lado de um limite de 8.
export function formatTimes(ratio: number): string {
  return ratio >= 10 ? integer.format(Math.floor(ratio)) : oneDecimal.format(Math.floor(ratio * 10) / 10);
}

export function formatPercent(fraction: number, digits = 1): string {
  const formatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${formatter.format(fraction * 100)}%`;
}

// Índice do array (0, 1, 2...) para a hora que as pessoas leem (1ª, 2ª, 3ª...).
export function hourNumber(index: number): number {
  return index + 1;
}

export function ordinalHour(index: number): string {
  return `${hourNumber(index)}ª hora`;
}

export function hourSpan(start: number, end: number): string {
  if (start === end) return `na ${ordinalHour(start)}`;
  return `entre a ${hourNumber(start)}ª e a ${ordinalHour(end)}`;
}

export function hoursCount(count: number): string {
  return count === 1 ? "1 hora" : `${count} horas`;
}

export function listInPortuguese(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}
