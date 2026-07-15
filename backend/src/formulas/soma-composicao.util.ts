/**
 * Faixa aceitável da soma das concentrações de uma fórmula (P0-1).
 * REGRA: o rascunho salva PARCIAL (soma qualquer — fórmula incompleta é estado
 * natural); a faixa é exigida na VALIDAÇÃO (uma fórmula 50% não é validável).
 */
export const SOMA_MIN = 99.5;
export const SOMA_MAX = 100.5;

export function somaComposicao(concentracoes: Array<number | null | undefined>): number {
  return concentracoes.reduce<number>((acc, c) => acc + (c != null && !Number.isNaN(c) ? c : 0), 0);
}

export function somaValidaParaValidacao(soma: number): boolean {
  return soma >= SOMA_MIN && soma <= SOMA_MAX;
}
