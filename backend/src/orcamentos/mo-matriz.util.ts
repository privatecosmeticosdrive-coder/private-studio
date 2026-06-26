/**
 * Modelo de MO da MATRIZ DE CUSTO — CANDIDATO (F4 passo 2), rodado em PARALELO
 * ao engine vigente apenas para COMPARAÇÃO. NÃO faz parte do cálculo que grava
 * preço. A função é pura (não toca Prisma).
 *
 * Diferença vs. engine vigente: a base é `custo_fixo_mensal` (Matriz), não
 * `mo_folha_mensal`; e o tempo é contínuo (minutos), não dias inteiros (ceil).
 */
export interface ParametrosMoMatriz {
  custo_fixo_mensal: number;
  mo_dias_uteis: number;
  horas_dia: number;
  imposto_mo_pct: number;
}

const r4 = (n: number) => Number(n.toFixed(4));

export function calcularMoMatriz(p: ParametrosMoMatriz, un_min: number) {
  // ATENÇÃO — eficiencia_linha NÃO entra aqui DE PROPÓSITO.
  // un_min é LÍQUIDO: já embute a eficiência real da produção (com paradas).
  // Logo, minutos_do_lote (= quantidade/un_min) já são minutos REAIS.
  // O `custo_minuto` que a Matriz exibe na tela (15,18) divide por
  // (dias × horas × 60 × eficiencia_linha) — aplicar essa eficiência AQUI,
  // junto com un_min líquido, contaria a eficiência DUAS VEZES.
  // Por isso o denominador é só (dias × horas × 60) — custo/minuto BRUTO.
  const minutos_disponiveis = p.mo_dias_uteis * p.horas_dia * 60;
  const custo_minuto_bruto =
    minutos_disponiveis > 0 ? p.custo_fixo_mensal / minutos_disponiveis : 0;

  // mo_lote = custo_minuto_bruto × (quantidade / un_min)
  // mo_un   = mo_lote / quantidade = custo_minuto_bruto / un_min
  const mo_un = un_min > 0 ? custo_minuto_bruto / un_min : 0;

  // mesmo imposto de MO do modelo vigente
  const cmo_cimp = mo_un * (1 + p.imposto_mo_pct / 100);

  return {
    custo_minuto_bruto: r4(custo_minuto_bruto),
    mo_un: r4(mo_un),
    cmo_cimp: r4(cmo_cimp),
  };
}
