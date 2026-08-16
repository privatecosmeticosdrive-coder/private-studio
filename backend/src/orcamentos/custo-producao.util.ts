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
  /** política comercial (ex.: 2.400) — usada só no alerta de MOQ, não no custo. */
  moq_economico_valor?: number;
}

/** Teto de participação do setup no custo do lote (política): 10%. */
export const PESO_SETUP_MAXIMO = 0.1;

export interface AlertaMoq {
  custo_lote: number;
  peso_setup_pct: number; // participação do setup no custo do lote
  /** menor custo de lote que satisfaz AMBOS os critérios */
  lote_minimo_valor: number;
  /** quantidade que atinge esse custo de lote, nas condições deste orçamento */
  quantidade_minima: number;
  motivo: 'abaixo_do_valor_minimo' | 'setup_acima_do_teto' | 'ambos';
}

/**
 * ALERTA de MOQ econômico — DERIVADO no cálculo, nunca coluna. NÃO bloqueia e
 * NÃO aplica margem premium (isso é decisão comercial da escada de volume):
 * só torna visível que o lote é pequeno demais para diluir o setup.
 *
 * Dispara se o custo do lote fica abaixo do mínimo de política OU se o setup
 * pesa mais que o teto. `custo_un_variavel` = custo por unidade SEM o setup
 * (material + corrida) — é o que escala com a quantidade.
 */
export function avaliarMoq(
  custo_setup_ordem: number,
  custo_un_variavel: number,
  quantidade: number,
  moq_economico_valor?: number,
): AlertaMoq | null {
  const custo_lote = custo_un_variavel * quantidade + custo_setup_ordem;
  if (custo_lote <= 0) return null;
  const peso = custo_setup_ordem / custo_lote;

  const abaixoValor = moq_economico_valor != null && custo_lote < moq_economico_valor;
  const setupAlto = peso > PESO_SETUP_MAXIMO;
  if (!abaixoValor && !setupAlto) return null;

  // lote mínimo que satisfaz os DOIS critérios:
  //  - custo_lote >= moq_economico_valor
  //  - setup/custo_lote <= teto  =>  custo_lote >= setup / teto
  const alvo = Math.max(moq_economico_valor ?? 0, custo_setup_ordem / PESO_SETUP_MAXIMO);
  // custo_lote(q) = custo_un_variavel × q + setup  =>  q = (alvo − setup) / custo_un_variavel
  const qMin =
    custo_un_variavel > 0 ? Math.ceil((alvo - custo_setup_ordem) / custo_un_variavel) : 0;

  return {
    custo_lote: r2(custo_lote),
    peso_setup_pct: Number((peso * 100).toFixed(2)),
    lote_minimo_valor: r2(alvo),
    quantidade_minima: Math.max(qMin, quantidade + 1),
    motivo: abaixoValor && setupAlto ? 'ambos' : abaixoValor ? 'abaixo_do_valor_minimo' : 'setup_acima_do_teto',
  };
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
