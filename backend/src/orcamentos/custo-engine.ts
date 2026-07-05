/**
 * Parâmetros OPERACIONAIS de custo (Doc 1 §6). Após o corte da F4 Fase A, o
 * cálculo de preço mora em custo-engine-fiscal.ts (tributos granulares de
 * saída). Este módulo guarda só o que ainda é compartilhado:
 *  - ParametrosCusto: leitura da system_config (params.util). Os campos
 *    imposto_mp_pct/imposto_mo_pct/ipi_pct são LEGADOS (não mais usados no
 *    cálculo; removidos da system_config só na F6). mo_folha_mensal,
 *    mo_dias_uteis, desvio_mp_pct, frete_un_brl seguem operacionais.
 *  - producaoDiaria: produtividade diária a partir de un/min (usada pelo
 *    engine fiscal, que mantém o MESMO modelo de MO — folha/dias × ceil).
 *
 * Unidades: volume_un em mL/g (kg = volume_un/1000); MP em R$/kg; custo por unidade.
 */

export interface ParametrosCusto {
  mo_folha_mensal: number;
  mo_dias_uteis: number;
  imposto_mp_pct: number; // LEGADO (F6 remove) — não usado no cálculo pós-corte
  imposto_mo_pct: number; // LEGADO (F6 remove)
  ipi_pct: number; // LEGADO (F6 remove) — IPI agora vem do NCM
  desvio_mp_pct: number; // 10
  frete_un_brl: number; // 0.10
}

/** producao diaria a partir de un/min: un_min × 60min × 8h = un_min × 480 (Doc 2d §A3). */
export function producaoDiaria(un_min: number): number {
  return Math.max(0.01, un_min) * 480;
}
