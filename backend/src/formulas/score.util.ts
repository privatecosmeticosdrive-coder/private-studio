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

/**
 * Score do MATERIAL do orçamento: média ponderada MP × embalagem pela
 * participação de cada um no custo de material. Antes o score ignorava a
 * embalagem — no #76 ela era 93,9% do custo e não pontuava nada.
 *
 * `scoreEmb = null` (sem embalagem, ou embalagem de custo zero) => devolve o
 * score de MP puro, sem diluir.
 */
export function scoreMaterialPonderado(
  scoreMp: number,
  custoMpUn: number,
  scoreEmb: number | null,
  custoEmbUn: number,
): number {
  const total = custoMpUn + custoEmbUn;
  if (scoreEmb == null || custoEmbUn <= 0 || total <= 0) return Math.round(scoreMp);
  return Math.round((scoreMp * custoMpUn + scoreEmb * custoEmbUn) / total);
}

/** Faixa visual do termometro (Doc 1 §7). */
export function faixaScore(score: number): 'verde' | 'amarelo' | 'laranja' | 'vermelho' {
  if (score >= 90) return 'verde';
  if (score >= 75) return 'amarelo';
  if (score >= 60) return 'laranja';
  return 'vermelho';
}
