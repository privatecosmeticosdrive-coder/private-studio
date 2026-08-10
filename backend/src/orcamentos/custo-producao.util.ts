/**
 * Modelo de MO de 3 componentes (rodada 2 do agente financeiro, ago/2026) —
 * função PURA, não toca banco. CANDIDATA: o engine vigente NÃO a usa até o
 * corte (F3); antes disso ela alimenta só o comparador read-only (F2).
 *
 * preco = (material + embalagem + frete
 *          + custo_setup_ordem/qtde_lote            <- setup por ORDEM, diluído
 *          + (1/un_por_min) × taxa_minuto)          <- corrida em minuto PRODUTIVO
 *         ÷ (1 − imposto% − margem%)
 *
 * TUDO DERIVADO dos parâmetros vigentes (parametro_producao) — taxa_minuto,
 * capacidade, custo do setup e minutos produtivos NUNCA são literais:
 *   capacidade_normal_min_mes = linhas × dias × horas × 60 × eficiencia
 *   taxa_minuto               = custo_fixo_producao_mensal ÷ capacidade_normal
 *   custo_setup_ordem         = taxa_minuto × setup_minutos
 *   minutos_produtivos_dia_linha = horas × 60 × eficiencia   (substitui o 480)
 *
 * REGRA ANTI-DUPLA-CONTAGEM: `un_min` do orçamento é velocidade em minuto
 * PRODUTIVO — NUNCA multiplicá-lo pela eficiência. A eficiência mora SÓ no
 * denominador da capacidade (mesma lição documentada em mo-matriz.util.ts).
 *
 * FORA DO CUSTO, JAMAIS (CPC 16 item 13): ociosidade e SG&A — resultado do
 * período, não custo do produto.
 */

export interface ParametrosProducao {
  custo_fixo_producao_mensal: number; // ex.: 83.084 (produção + depreciação; SEM SG&A/ociosidade)
  linhas_paralelas: number; // ex.: 2,5
  eficiencia_producao: number; // fração, ex.: 0,82
  setup_minutos: number; // ex.: 60 (global por ora)
  dias_uteis_mes: number; // ex.: 22
  horas_dia: number; // ex.: 8
}

export interface CustoProducao {
  /** derivados de parâmetro (iguais para qualquer orçamento na mesma vigência) */
  capacidade_normal_min_mes: number;
  taxa_minuto: number;
  custo_setup_ordem: number;
  minutos_produtivos_dia_linha: number;
  /** por orçamento */
  producao_dia_linha: number; // un/dia numa linha (exibição; substitui un_min×480)
  setup_un: number; // custo_setup_ordem / quantidade
  corrida_un: number; // taxa_minuto / un_min
  custo_producao_un: number; // setup_un + corrida_un
}

const r4 = (n: number) => Number(n.toFixed(4));
const r2 = (n: number) => Number(n.toFixed(2));

export function calcularCustoProducao(
  p: ParametrosProducao,
  un_min: number,
  quantidade: number,
): CustoProducao {
  if (un_min <= 0) throw new Error('un_min deve ser > 0 (velocidade em minuto produtivo).');
  if (quantidade <= 0) throw new Error('quantidade deve ser > 0.');

  // ---- derivados de parâmetro (nunca literais) ----
  const capacidade_normal_min_mes =
    p.linhas_paralelas * p.dias_uteis_mes * p.horas_dia * 60 * p.eficiencia_producao;
  if (capacidade_normal_min_mes <= 0) {
    throw new Error('Capacidade normal <= 0 — parametros de producao invalidos.');
  }
  const taxa_minuto = p.custo_fixo_producao_mensal / capacidade_normal_min_mes;
  const custo_setup_ordem = taxa_minuto * p.setup_minutos;
  const minutos_produtivos_dia_linha = p.horas_dia * 60 * p.eficiencia_producao;

  // ---- por orçamento ----
  // un_min JÁ é por minuto produtivo: NÃO multiplicar pela eficiência aqui.
  const producao_dia_linha = un_min * minutos_produtivos_dia_linha;
  const setup_un = custo_setup_ordem / quantidade; // dilui com o lote (fim do ceil)
  const corrida_un = taxa_minuto / un_min; // tempo REAL, contínuo

  return {
    capacidade_normal_min_mes: r2(capacidade_normal_min_mes),
    taxa_minuto: r4(taxa_minuto),
    custo_setup_ordem: r2(custo_setup_ordem),
    minutos_produtivos_dia_linha: r2(minutos_produtivos_dia_linha),
    producao_dia_linha: r2(producao_dia_linha),
    setup_un: r4(setup_un),
    corrida_un: r4(corrida_un),
    custo_producao_un: r4(setup_un + corrida_un),
  };
}
