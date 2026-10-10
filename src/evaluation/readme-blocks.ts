// Blocos do README que só o comando escreve. Cada bloco fica entre dois marcadores;
// o teste do README compara o conteúdo publicado com o recalculado.

export const BLOCK_NAMES = ["regras", "organico-x-comprado", "abstencao", "familias", "metricas"] as const;
export type BlockName = (typeof BLOCK_NAMES)[number];

export function startMarker(name: BlockName): string {
  return `<!-- ${name}:inicio -->`;
}

export function endMarker(name: BlockName): string {
  return `<!-- ${name}:fim -->`;
}

function occurrences(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function locate(readme: string, name: BlockName): { from: number; to: number } {
  const start = startMarker(name);
  const end = endMarker(name);
  const starts = occurrences(readme, start);
  const ends = occurrences(readme, end);
  if (starts === 0 || ends === 0) throw new Error(`README sem o bloco "${name}": faltam os marcadores ${start} e ${end}.`);
  if (starts > 1 || ends > 1) throw new Error(`README com o bloco "${name}" duplicado.`);
  const from = readme.indexOf(start) + start.length;
  const to = readme.indexOf(end);
  if (to < from) throw new Error(`README com os marcadores do bloco "${name}" fora de ordem.`);
  return { from, to };
}

export function extractBlock(readme: string, name: BlockName): string {
  const { from, to } = locate(readme, name);
  return readme.slice(from, to);
}

export function replaceBlock(readme: string, name: BlockName, content: string): string {
  const { from, to } = locate(readme, name);
  return readme.slice(0, from) + content + readme.slice(to);
}
