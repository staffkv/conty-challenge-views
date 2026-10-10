import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOCK_NAMES, extractBlock, replaceBlock } from "../src/evaluation/readme-blocks.ts";
import { runEvaluation } from "../src/evaluation/run.ts";

// Lê o README versionado e só compara: nenhum passo anterior o reescreve.
const readme = readFileSync("README.md", "utf8");
const run = runEvaluation();

const integer = new Intl.NumberFormat("pt-BR");

function publishedFalsePositive(text: string): { numerator: number; denominator: number } {
  const match = extractBlock(text, "metricas").match(/Taxa de falso positivo: ([\d.]+) de ([\d.]+) séries legítimas/);
  if (!match) throw new Error("README sem a linha da taxa de falso positivo no bloco de métricas.");
  const parse = (value: string) => Number(value.replaceAll(".", ""));
  return { numerator: parse(match[1]), denominator: parse(match[2]) };
}

describe("README em dia com o medido", () => {
  it("a taxa de falso positivo publicada é a que o comando mede", () => {
    expect(publishedFalsePositive(readme)).toEqual({
      numerator: run.metrics.falsePositive.numerator,
      denominator: run.metrics.falsePositive.denominator,
    });
  });

  for (const name of BLOCK_NAMES) {
    it(`bloco "${name}" igual ao gerado pelo código`, () => {
      expect(extractBlock(readme, name)).toBe(run.blocks[name]);
    });
  }
});

describe("conferência dos blocos", () => {
  it("um número adulterado é detectado", () => {
    const { numerator, denominator } = run.metrics.falsePositive;
    const original = `Taxa de falso positivo: ${integer.format(numerator)} de ${integer.format(denominator)}`;
    const tampered = readme.replace(original, `Taxa de falso positivo: ${integer.format(numerator + 1)} de ${integer.format(denominator)}`);
    expect(tampered).not.toBe(readme);
    expect(publishedFalsePositive(tampered).numerator).not.toBe(numerator);
    expect(extractBlock(tampered, "metricas")).not.toBe(run.blocks.metricas);
  });

  it("bloco ausente ou duplicado é erro", () => {
    expect(() => extractBlock("# sem blocos", "metricas")).toThrow(/sem o bloco/);
    const duplicated = `${readme}\n<!-- metricas:inicio -->\n<!-- metricas:fim -->\n`;
    expect(() => extractBlock(duplicated, "metricas")).toThrow(/duplicado/);
  });

  it("reescrever um bloco não toca no resto do texto", () => {
    const rewritten = replaceBlock(readme, "metricas", "\nnovo\n");
    expect(extractBlock(rewritten, "metricas")).toBe("\nnovo\n");
    expect(rewritten.replace("\nnovo\n", run.blocks.metricas)).toBe(readme);
  });
});

describe("nota de uso de IA", () => {
  const section = readme.slice(readme.indexOf("## Uso de IA"));

  it("existe e declara o que foi feito com IA e o que foi revisado", () => {
    expect(readme).toContain("## Uso de IA");
    expect(section).toContain("### Feito com IA");
    expect(section).toContain("### O que eu revisei");
  });

  it("está preenchida: a entrega sem essa nota não entra na avaliação", () => {
    expect(section).not.toContain("PREENCHER");
    const reviewed = section.slice(section.indexOf("### O que eu revisei") + "### O que eu revisei".length).trim();
    expect(reviewed.length).toBeGreaterThan(80);
  });
});
