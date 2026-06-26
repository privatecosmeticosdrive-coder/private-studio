import type { SystemConfig } from '@prisma/client';
import type { ParametrosCusto } from './custo-engine';

/**
 * Ponto único de leitura dos parâmetros LEGADOS de custo a partir da
 * system_config. Extraído de CalculoService.getParametros SEM alterar a
 * aritmética: mesmos 7 campos, mesmos fallbacks, mesmo Number(...).
 * Função PURA (não toca Prisma) — recebe a linha já carregada (ou null).
 * (F4 passo 1 — apenas centraliza DE ONDE os params vêm; preço inalterado.)
 */
export function lerParametrosCusto(c: SystemConfig | null): ParametrosCusto {
  return {
    mo_folha_mensal: c ? Number(c.mo_folha_mensal) : 75000,
    mo_dias_uteis: c ? c.mo_dias_uteis : 20,
    imposto_mp_pct: c ? Number(c.imposto_mp_pct) : 37.5,
    imposto_mo_pct: c ? Number(c.imposto_mo_pct) : 9.25,
    ipi_pct: c ? Number(c.ipi_pct) : 4.55,
    desvio_mp_pct: c ? Number(c.desvio_mp_pct) : 10,
    frete_un_brl: c ? Number(c.frete_un_brl) : 0.1,
  };
}
