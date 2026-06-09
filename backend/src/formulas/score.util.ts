/**
 * Termometro de assertividade (Doc 1 §7) — score 0-100 por idade da cotacao.
 *   <= 3 meses: 98 | 3-6: 88 | 6-12: 74 | > 12: 60 | sem data: 50
 */
export function scoreCotacao(dataCotacao: Date | null | undefined): number {
  if (!dataCotacao) return 50;
  const meses =
    (Date.now() - new Date(dataCotacao).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (meses <= 3) return 98;
  if (meses <= 6) return 88;
  if (meses <= 12) return 74;
  return 60;
}

/** Faixa visual do termometro (Doc 1 §7). */
export function faixaScore(score: number): 'verde' | 'amarelo' | 'laranja' | 'vermelho' {
  if (score >= 90) return 'verde';
  if (score >= 75) return 'amarelo';
  if (score >= 60) return 'laranja';
  return 'vermelho';
}
