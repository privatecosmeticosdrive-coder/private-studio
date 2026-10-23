/**
 * ANÁLISE DE VIABILIDADE DE PROJETOS (Matriz de Custo, 10/26) — engine PURO e
 * DETERMINÍSTICO. Avalia um projeto ímpar em DOIS cenários lado a lado:
 *
 *  - `ideal`  : política vigente (escada de margem do Motor 2, taxa de gestão
 *               da embalagem, créditos de entrada, fábrica da vigência).
 *  - `limite` : "até onde podemos ir" — as MESMAS premissas com os ajustes do
 *               usuário (margem menor, preço imposto pelo cliente/mercado,
 *               volume maior, hora extra...). Herda do ideal e sobrescreve.
 *
 * Reutiliza as funções puras existentes — NÃO reimplementa tributos nem fábrica:
 *  - calcularCustoMotor2 / resolverMargem  (custo-engine-motor2.ts)
 *  - calcularCustoProducao / avaliarMoq    (custo-producao.util.ts, via o Motor 2)
 *  - resolverTributosSaida                 (matriz-fiscal.util.ts)
 *
 * Regras: sem defaults silenciosos (campo obrigatório ausente -> erro listando
 * o que falta), números com 4 casas e dinheiro com 2, strings só em Latin-1
 * (o resultado é gravado em JSON e impresso), `premissas_usadas[]` e
 * `fundamentos[]` declarados como o Motor 2 faz. Zero banco, zero Date.
 */
import {
  calcularCustoMotor2,
  resolverMargem,
  TETO_MARKUP_TRIBUTOS_PCT,
  type CalculoCustoMotor2,
  type EscadaMargem,
  type ParametrosMotor2,
} from '../orcamentos/custo-engine-motor2';
import {
  calcularCustoProducao,
  type ParametrosProducao,
} from '../orcamentos/custo-producao.util';
import {
  resolverTributosSaida,
  type CaracterizacaoFiscal,
  type ModoOperacao,
  type NcmFiscal,
  type ParametrosFiscaisVigentes,
  type PerfilClienteFiscal,
  type TributosParcela,
  type TributosSaida,
} from '../orcamentos/matriz-fiscal.util';
import type { VigenciaUsada } from '../orcamentos/params-motor2.util';

export const VIABILIDADE_ENGINE_ID = 'Viabilidade 10/26 (sobre Motor 2 10/26)' as const;

export const MODOS_OPERACAO: ModoOperacao[] = ['full_service', 'hibrido', 'industrializacao'];

// ============================================================================
// PREMISSAS
// ============================================================================

/** Todas as entradas ajustáveis de UM cenário. Cada cenário tem a sua cópia. */
export interface PremissasCenario {
  produto: string;
  volume_un: number; // mL/g por unidade (densidade 1,0 — premissa declarada)
  quantidade: number; // unidades por lote
  lotes_por_mes: number;
  un_min: number; // unidades por minuto PRODUTIVO
  cmp_base_mp_kg: number; // R$/kg de fórmula (última compra); 0 => alerta mp_sem_preco
  perda_mp_pct: number;
  credito_mp_pct: number;
  credito_emb_pct: number;
  embalagem_un: number; // R$ bruto por unidade (catálogo)
  taxa_gestao_embalagem_pct: number;
  frete_un_brl: number;
  modo_operacao: ModoOperacao;
  perfil_fiscal: PerfilClienteFiscal;
  ncm: NcmFiscal;
  /** margem MANUAL (markup do Motor 2). null => escada automática por lote. */
  margem_pct: number | null;
  /** preço de venda IMPOSTO (sem IPI). null => calculado pelo Motor 2. */
  preco_venda_un: number | null;
  investimento_brl: number; // equipamentos/moldes
  investimento_meses_depreciacao: number; // obrigatório (> 0) quando investimento_brl > 0
  custo_fixo_incremental_mes: number; // pessoa extra, aluguel extra...
  horizonte_meses: number;
  margem_minima_aceitavel_pct: number; // sobre a receita bruta sem IPI (DRE do projeto)
  pessoas_por_linha: number; // para horas-homem e custo de HE
  ocupacao_atual_pct: number | null; // null = desconhecida (HE não avaliada)
  custo_hora_extra_hora: number | null; // R$ por PESSOA-hora; null = não informado
  horas_extra_maximas_mes: number | null; // teto de horas de LINHA extras/mês
  mp_sem_preco?: string[];
}

export interface PremissasViabilidade {
  ideal: PremissasCenario;
  /** sobrescreve o ideal campo a campo (undefined = herda). */
  limite?: Partial<PremissasCenario> | null;
}

/** Lido pelo service a partir das vigências; passado ao engine. */
export interface ContextoViabilidade {
  producao: ParametrosProducao;
  fiscal: ParametrosFiscaisVigentes;
  caracterizacao: CaracterizacaoFiscal;
  escada: EscadaMargem;
  lote_minimo_un: number;
  /** vigências usadas (rastreabilidade) — repassadas ao resultado. */
  vigencias: VigenciaUsada[];
}

// ============================================================================
// RESULTADO
// ============================================================================

export type NivelAlerta = 'bloqueante' | 'atencao';
export interface AlertaViabilidade {
  codigo: string;
  nivel: NivelAlerta;
  mensagem: string;
}

export interface PrecoCenario {
  origem: 'motor2' | 'imposto';
  /** markup aplicado (Motor 2). null = preço imposto abaixo do custo + tributos (margem negativa). */
  margem_pct: number | null;
  margem_origem: 'escada' | 'manual' | 'derivada' | 'inviavel';
  margem_escada_pct: number;
  faixa_lote: string;
  preco_produto_sipi: number;
  preco_embalagem_sipi: number;
  preco_sipi: number;
  ipi_pct: number;
  base_ipi: TributosSaida['base_ipi'];
  ipi_un: number;
  icms_sobre_ipi_un: number;
  preco_cipi: number;
  /** % de tributos por dentro sobre o preço sem IPI (efetiva, ponderada pelas parcelas). */
  tributos_por_dentro_pct: number;
}

export interface DecomposicaoUnitaria {
  mp_bruta: number;
  perda: number;
  credito_mp: number;
  mp_liquida: number;
  embalagem_bruta: number;
  credito_emb: number;
  embalagem_liquida: number;
  frete: number;
  fabrica_setup: number;
  fabrica_corrida: number;
  fabrica_total: number;
  custo_total: number; // mp_liquida + embalagem_liquida + frete + fabrica_total
  tributos_por_dentro: number; // R$
  ipi_por_fora: number; // R$
  margem_brl: number; // preco_sipi - tributos - custo_total (pode ser negativa)
  margem_sobre_preco_pct: number;
  /** margem de contribuição: preco - tributos - MP - emb - frete (sem fábrica). */
  margem_contribuicao: number;
  /** idem, descontando também a fábrica (setup diluído + corrida). */
  margem_contribuicao_com_absorcao: number;
}

export interface TempoLinha {
  setup_minutos: number;
  corrida_minutos_lote: number;
  minutos_lote: number;
  horas_lote: number;
  dias_linha_lote: number;
  minutos_produtivos_dia_linha: number;
  horas_homem_lote: number;
  pessoas_por_linha: number;
  minutos_mes: number;
  horas_mes: number;
  capacidade_normal_min_mes: number;
  ocupacao_projeto_pct: number;
  ocupacao_atual_pct: number | null;
  ocupacao_total_pct: number | null;
}

export interface HoraExtra {
  avaliada: boolean; // false = ocupação atual desconhecida
  minutos_excedentes_mes: number | null;
  horas_linha_extra_mes: number | null; // horas-relógio de linha
  horas_pessoa_extra_mes: number | null; // x pessoas_por_linha
  custo_hora_pessoa: number | null;
  custo_mes: number | null; // null = não custeada (custo da HE não informado)
  teto_horas_mes: number | null;
  excede_teto: boolean;
}

export interface DreProjeto {
  meses: number;
  unidades: number;
  lotes: number;
  receita_bruta_sipi: number;
  tributos_por_dentro: number;
  receita_liquida: number;
  mp_liquida: number;
  embalagem_liquida: number;
  frete: number;
  custos_variaveis: number;
  fabrica_setup: number;
  fabrica_corrida: number;
  fabrica: number;
  hora_extra: number | null; // null = não custeada
  custo_fixo_incremental: number;
  depreciacao: number;
  custos_incrementais_fixos: number; // fixo + depreciação + HE (0 quando null)
  lucro_operacional: number;
  margem_sobre_receita_pct: number | null; // null se receita 0
  fluxo_caixa_operacional: number; // lucro + depreciação
}

export interface PontoEquilibrio {
  custos_fixos_incrementais_mes: number;
  margem_contribuicao_un: number;
  unidades_mes: number | null; // null = MC <= 0
  lotes_mes: number | null;
  producao_minima_lotes_mes: number | null; // arredondado para cima
  producao_minima_unidades_mes: number | null;
  com_absorcao: {
    margem_contribuicao_un: number;
    unidades_mes: number | null;
    lotes_mes: number | null;
  };
}

export interface PrecosMinimos {
  /** preço sem IPI em que o lucro do projeto no horizonte é zero. null = inatingível. */
  viavel: number | null;
  /** preço sem IPI que entrega margem_minima_aceitavel_pct sobre a receita. */
  com_margem_minima: number | null;
  margem_minima_aceitavel_pct: number;
  tolerancia: number;
}

export interface ResultadoCenario {
  nome: 'ideal' | 'limite';
  premissas: PremissasCenario;
  preco: PrecoCenario;
  unitario: DecomposicaoUnitaria;
  tempo_linha: TempoLinha;
  hora_extra: HoraExtra;
  dre_mensal: DreProjeto;
  dre_horizonte: DreProjeto;
  investimento: {
    valor: number;
    meses_depreciacao: number;
    depreciacao_mes: number;
    payback_meses: number | null; // null = nunca
    payback_dentro_do_horizonte: boolean | null;
  };
  ponto_equilibrio: PontoEquilibrio;
  precos_minimos: PrecosMinimos;
  alertas: AlertaViabilidade[];
  bloqueado: boolean;
  /** cálculo bruto do Motor 2 que sustenta o cenário (rastreabilidade). */
  motor2: CalculoCustoMotor2;
  tributos: TributosSaida;
}

export interface LinhaEspelho {
  campo: string;
  rotulo: string;
  unidade: string;
  ideal: number | null;
  limite: number | null;
  diferenca: number | null; // limite - ideal
}

export interface ResultadoViabilidade {
  engine: typeof VIABILIDADE_ENGINE_ID;
  ideal: ResultadoCenario;
  limite: ResultadoCenario;
  espelho: LinhaEspelho[];
  premissas_usadas: string[];
  fundamentos: string[];
  vigencias_parametros: VigenciaUsada[];
  contexto: {
    producao: ParametrosProducao;
    fiscal: ParametrosFiscaisVigentes;
    caracterizacao: CaracterizacaoFiscal;
    escada: EscadaMargem;
    lote_minimo_un: number;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

const r2 = (n: number) => Number(n.toFixed(2));
const r4 = (n: number) => Number(n.toFixed(4));
const r2n = (n: number | null) => (n == null ? null : r2(n));
const r4n = (n: number | null) => (n == null ? null : r4(n));

export const TOLERANCIA_BISSECAO = 0.001;
const ITERACOES_BISSECAO = 80;

/**
 * O resultado é gravado em JSON e impresso: só Latin-1. Os fundamentos da
 * matriz fiscal e as mensagens do Motor 2 usam travessão/setas; aqui eles são
 * convertidos (nunca silenciosamente descartados: resto vira '?').
 */
const TROCAS_LATIN1: Array<[RegExp, string]> = [
  [/[—–−‐‑]/g, '-'], // — – − ‐ ‑
  [/→/g, '->'],
  [/←/g, '<-'],
  [/≥/g, '>='],
  [/≤/g, '<='],
  [/≠/g, '!='],
  [/≈/g, '~'],
  [/…/g, '...'],
  [/[‘’‚]/g, "'"],
  [/[“”„]/g, '"'],
  [/•/g, '*'],
  [/ /g, ' '],
];
export function paraLatin1(s: string): string {
  let out = s;
  for (const [re, sub] of TROCAS_LATIN1) out = out.replace(re, sub);
  // eslint-disable-next-line no-control-regex
  return out.replace(/[^\u0000-ÿ]/g, '?');
}
/** aplica paraLatin1 em TODA string do objeto (profundo, imutável). */
export function sanitizarLatin1<T>(v: T): T {
  if (typeof v === 'string') return paraLatin1(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => sanitizarLatin1(x)) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = sanitizarLatin1(x);
    return out as T;
  }
  return v;
}

/** bisseção de f (monótona crescente em x) até f(x) = alvo com tolerância. */
function bissecao(
  f: (x: number) => number,
  alvo: number,
  lo: number,
  hi: number,
  tolerancia = TOLERANCIA_BISSECAO,
): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < ITERACOES_BISSECAO; i++) {
    const m = (a + b) / 2;
    const v = f(m);
    if (Math.abs(v - alvo) < tolerancia) return m;
    if (v < alvo) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** % de tributos "por dentro" de uma parcela (mesma leitura do Motor 2). */
function taxaPorDentro(t: TributosParcela): number {
  const icms = t.icms.tipo === 'tributado' ? t.icms.pct : 0;
  return icms + t.pis_pct + t.cofins_pct;
}

const ehNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function normalizarPerfil(p: Partial<PerfilClienteFiscal> | null | undefined): PerfilClienteFiscal {
  return {
    regime_fiscal: p?.regime_fiscal ?? null,
    finalidade: p?.finalidade ?? null,
    uf: p?.uf ?? null,
    contribuinte_icms: p?.contribuinte_icms ?? null,
  };
}

/**
 * Valida um cenário (regra 6: sem defaults silenciosos). Campos obrigatórios
 * ausentes ou inválidos -> erro com a lista completa do que falta.
 */
export function validarPremissas(c: Partial<PremissasCenario>, rotulo: string): PremissasCenario {
  const faltando: string[] = [];
  const req = (campo: keyof PremissasCenario, ok: boolean, regra: string) => {
    if (!ok) faltando.push(`${String(campo)} (${regra})`);
  };

  req('produto', typeof c.produto === 'string' && c.produto.trim().length > 0, 'nome do produto');
  req('volume_un', ehNum(c.volume_un) && c.volume_un > 0, '> 0 mL/g');
  req('quantidade', ehNum(c.quantidade) && c.quantidade > 0, '> 0 un por lote');
  req('lotes_por_mes', ehNum(c.lotes_por_mes) && c.lotes_por_mes > 0, '> 0 lotes/mes');
  req('un_min', ehNum(c.un_min) && c.un_min > 0, '> 0 un/min');
  req('cmp_base_mp_kg', ehNum(c.cmp_base_mp_kg) && c.cmp_base_mp_kg >= 0, '>= 0 R$/kg');
  req('perda_mp_pct', ehNum(c.perda_mp_pct) && c.perda_mp_pct >= 0, '>= 0 %');
  req('credito_mp_pct', ehNum(c.credito_mp_pct) && c.credito_mp_pct >= 0 && c.credito_mp_pct < 100, '0 a 99 %');
  req('credito_emb_pct', ehNum(c.credito_emb_pct) && c.credito_emb_pct >= 0 && c.credito_emb_pct < 100, '0 a 99 %');
  req('embalagem_un', ehNum(c.embalagem_un) && c.embalagem_un >= 0, '>= 0 R$');
  req(
    'taxa_gestao_embalagem_pct',
    ehNum(c.taxa_gestao_embalagem_pct) && c.taxa_gestao_embalagem_pct >= 0,
    '>= 0 %',
  );
  req('frete_un_brl', ehNum(c.frete_un_brl) && c.frete_un_brl >= 0, '>= 0 R$');
  req(
    'modo_operacao',
    typeof c.modo_operacao === 'string' && MODOS_OPERACAO.includes(c.modo_operacao),
    MODOS_OPERACAO.join('|'),
  );
  req('perfil_fiscal', !!c.perfil_fiscal && typeof c.perfil_fiscal === 'object', 'objeto do perfil fiscal');
  const n = c.ncm;
  req(
    'ncm',
    !!n &&
      typeof n.ncm === 'string' &&
      n.ncm.length > 0 &&
      ehNum(n.ipi_pct) &&
      typeof n.monofasico === 'boolean' &&
      typeof n.tratamento === 'string',
    'ncm, ipi_pct, monofasico, tratamento',
  );
  req(
    'margem_pct',
    c.margem_pct == null || (ehNum(c.margem_pct) && c.margem_pct >= 0 && c.margem_pct < 99),
    'null ou 0 a 98,99 %',
  );
  req('preco_venda_un', c.preco_venda_un == null || (ehNum(c.preco_venda_un) && c.preco_venda_un > 0), 'null ou > 0 R$');
  req('investimento_brl', ehNum(c.investimento_brl) && c.investimento_brl >= 0, '>= 0 R$');
  req(
    'investimento_meses_depreciacao',
    ehNum(c.investimento_meses_depreciacao) &&
      (c.investimento_meses_depreciacao > 0 || !(ehNum(c.investimento_brl) && c.investimento_brl > 0)),
    '> 0 meses quando ha investimento',
  );
  req(
    'custo_fixo_incremental_mes',
    ehNum(c.custo_fixo_incremental_mes) && c.custo_fixo_incremental_mes >= 0,
    '>= 0 R$/mes',
  );
  req('horizonte_meses', ehNum(c.horizonte_meses) && c.horizonte_meses > 0, '> 0 meses');
  req(
    'margem_minima_aceitavel_pct',
    ehNum(c.margem_minima_aceitavel_pct) && c.margem_minima_aceitavel_pct >= 0 && c.margem_minima_aceitavel_pct < 100,
    '0 a 99 %',
  );
  req('pessoas_por_linha', ehNum(c.pessoas_por_linha) && c.pessoas_por_linha > 0, '> 0 pessoas');
  req(
    'ocupacao_atual_pct',
    c.ocupacao_atual_pct == null || (ehNum(c.ocupacao_atual_pct) && c.ocupacao_atual_pct >= 0),
    'null ou >= 0 %',
  );
  req(
    'custo_hora_extra_hora',
    c.custo_hora_extra_hora == null || (ehNum(c.custo_hora_extra_hora) && c.custo_hora_extra_hora >= 0),
    'null ou >= 0 R$/h',
  );
  req(
    'horas_extra_maximas_mes',
    c.horas_extra_maximas_mes == null || (ehNum(c.horas_extra_maximas_mes) && c.horas_extra_maximas_mes >= 0),
    'null ou >= 0 h/mes',
  );

  if (faltando.length > 0) {
    throw new Error(
      `Premissas obrigatorias ausentes ou invalidas no cenario ${rotulo}: ${faltando.join('; ')}.`,
    );
  }

  return {
    produto: c.produto!.trim(),
    volume_un: c.volume_un!,
    quantidade: c.quantidade!,
    lotes_por_mes: c.lotes_por_mes!,
    un_min: c.un_min!,
    cmp_base_mp_kg: c.cmp_base_mp_kg!,
    perda_mp_pct: c.perda_mp_pct!,
    credito_mp_pct: c.credito_mp_pct!,
    credito_emb_pct: c.credito_emb_pct!,
    embalagem_un: c.embalagem_un!,
    taxa_gestao_embalagem_pct: c.taxa_gestao_embalagem_pct!,
    frete_un_brl: c.frete_un_brl!,
    modo_operacao: c.modo_operacao!,
    perfil_fiscal: normalizarPerfil(c.perfil_fiscal),
    ncm: {
      ncm: n!.ncm,
      ex_tipi: n!.ex_tipi ?? '',
      ipi_pct: n!.ipi_pct,
      monofasico: n!.monofasico,
      tratamento: n!.tratamento,
      icms_nominal_pct: n!.icms_nominal_pct ?? null,
    },
    margem_pct: c.margem_pct ?? null,
    preco_venda_un: c.preco_venda_un ?? null,
    investimento_brl: c.investimento_brl!,
    investimento_meses_depreciacao: c.investimento_meses_depreciacao!,
    custo_fixo_incremental_mes: c.custo_fixo_incremental_mes!,
    horizonte_meses: c.horizonte_meses!,
    margem_minima_aceitavel_pct: c.margem_minima_aceitavel_pct!,
    pessoas_por_linha: c.pessoas_por_linha!,
    ocupacao_atual_pct: c.ocupacao_atual_pct ?? null,
    custo_hora_extra_hora: c.custo_hora_extra_hora ?? null,
    horas_extra_maximas_mes: c.horas_extra_maximas_mes ?? null,
    mp_sem_preco: Array.isArray(c.mp_sem_preco) ? c.mp_sem_preco : [],
  };
}

/** O cenário limite HERDA do ideal e sobrescreve só o que foi informado. */
export function mesclarLimite(
  ideal: PremissasCenario,
  limite: Partial<PremissasCenario> | null | undefined,
): PremissasCenario {
  const out: Record<string, unknown> = { ...ideal };
  if (limite) {
    for (const [k, v] of Object.entries(limite)) {
      if (v === undefined) continue;
      if (k === 'perfil_fiscal' && v && typeof v === 'object') {
        out.perfil_fiscal = { ...ideal.perfil_fiscal, ...(v as object) };
      } else if (k === 'ncm' && v && typeof v === 'object') {
        out.ncm = { ...ideal.ncm, ...(v as object) };
      } else {
        out[k] = v;
      }
    }
  }
  return validarPremissas(out as Partial<PremissasCenario>, 'limite');
}

// ============================================================================
// PRECIFICAÇÃO DE UM CENÁRIO (Motor 2 + preço imposto por bisseção)
// ============================================================================

function paramsMotor2(c: PremissasCenario, ctx: ContextoViabilidade): ParametrosMotor2 {
  return {
    producao: ctx.producao,
    perda_mp_pct: c.perda_mp_pct,
    frete_un_brl: c.frete_un_brl,
    credito_mp_pct: c.credito_mp_pct,
    credito_emb_pct: c.credito_emb_pct,
    taxa_gestao_embalagem_pct: c.taxa_gestao_embalagem_pct,
    escada: ctx.escada,
    lote_minimo_un: ctx.lote_minimo_un,
  };
}

function rodarMotor2(
  c: PremissasCenario,
  params: ParametrosMotor2,
  tributos: TributosSaida,
  margem_pct: number | null,
): CalculoCustoMotor2 {
  return calcularCustoMotor2(
    {
      cmp_base_mp_kg: c.cmp_base_mp_kg,
      volume_un: c.volume_un,
      quantidade: c.quantidade,
      un_min: c.un_min,
      margem_pct,
      embalagem_un: c.embalagem_un,
      mp_sem_preco: c.mp_sem_preco ?? [],
    },
    params,
    tributos,
  );
}

/** soma das parcelas em 4 casas (preço sem IPI exato, antes do r2 do resultado). */
function somaParcelas(calc: CalculoCustoMotor2): number {
  return (
    (calc.parcelas.produto?.preco_un ?? 0) +
    (calc.parcelas.embalagem?.preco_un ?? 0) +
    (calc.parcelas.mo?.preco_un ?? 0)
  );
}

/** R$ de tributos por dentro por unidade: soma(preco_parcela x taxa). */
function tributosDasParcelas(calc: CalculoCustoMotor2): number {
  const ps = [calc.parcelas.produto, calc.parcelas.embalagem, calc.parcelas.mo];
  return ps.reduce((a, p) => a + (p ? (p.preco_un * p.taxa_pct) / 100 : 0), 0);
}

interface Precificacao {
  calc: CalculoCustoMotor2;
  tributos: TributosSaida;
  /** fator aplicado sobre as parcelas do Motor 2 (1 = preço do motor). */
  k: number;
  /** R$ de tributos por dentro por unidade, sem arredondar. */
  tributos_un: number;
  preco: PrecoCenario;
  alertas: AlertaViabilidade[];
}

function precificar(c: PremissasCenario, ctx: ContextoViabilidade): Precificacao {
  const params = paramsMotor2(c, ctx);
  const tributos = resolverTributosSaida(
    c.modo_operacao,
    c.perfil_fiscal,
    c.ncm,
    ctx.fiscal,
    ctx.caracterizacao,
  );
  const alertas: AlertaViabilidade[] = [];
  const escada = resolverMargem(c.quantidade, null, ctx.escada);

  let calc: CalculoCustoMotor2;
  let k = 1;
  let margem_pct: number | null;
  let margem_origem: PrecoCenario['margem_origem'];
  let preco_sipi: number;

  if (c.preco_venda_un == null) {
    // -------- preço pelo Motor 2 (escada ou margem manual) --------
    calc = rodarMotor2(c, params, tributos, c.margem_pct);
    margem_pct = calc.margem.aplicada_pct;
    margem_origem = calc.margem.origem;
    preco_sipi = somaParcelas(calc);
  } else {
    // -------- preço IMPOSTO: margem derivada por bisseção --------
    const alvo = c.preco_venda_un;
    const taxaMax = Math.max(
      tributos.material ? taxaPorDentro(tributos.material) : 0,
      tributos.mo ? taxaPorDentro(tributos.mo) : 0,
    );
    // grossUp do Motor 2 LANÇA quando markup + tributos por dentro > TETO (85%):
    // a bisseção nunca pede ao engine uma margem que estoure o teto.
    const mMax = Math.max(0, TETO_MARKUP_TRIBUTOS_PCT - taxaMax - 0.01);
    const f = (m: number) => somaParcelas(rodarMotor2(c, params, tributos, m));
    const pZero = f(0);
    if (alvo < pZero - TOLERANCIA_BISSECAO) {
      // abaixo do custo + tributos: nenhuma margem >= 0 reproduz o preço.
      calc = rodarMotor2(c, params, tributos, 0);
      k = alvo / pZero;
      margem_pct = null;
      margem_origem = 'inviavel';
      alertas.push({
        codigo: 'preco_abaixo_do_custo',
        nivel: 'bloqueante',
        mensagem:
          `Preco imposto de R$ ${r2(alvo).toFixed(2)} fica ABAIXO do custo + tributos por dentro ` +
          `(R$ ${r2(pZero).toFixed(2)} com margem zero). Cada unidade vendida da prejuizo.`,
      });
    } else if (alvo > f(mMax)) {
      calc = rodarMotor2(c, params, tributos, mMax);
      k = alvo / somaParcelas(calc);
      margem_pct = mMax;
      margem_origem = 'derivada';
      alertas.push({
        codigo: 'margem_acima_do_teto',
        nivel: 'atencao',
        mensagem:
          `Preco imposto de R$ ${r2(alvo).toFixed(2)} exigiria margem acima do teto do Motor 2 ` +
          `(markup + tributos por dentro <= ${TETO_MARKUP_TRIBUTOS_PCT}%; markup maximo ${r2(mMax)}%). Margem reportada no teto.`,
      });
    } else {
      const m = bissecao(f, alvo, 0, mMax);
      calc = rodarMotor2(c, params, tributos, m);
      k = alvo / somaParcelas(calc); // ~1 (dentro da tolerância)
      margem_pct = r4(m);
      margem_origem = 'derivada';
    }
    preco_sipi = alvo;
  }

  const preco_produto_sipi =
    ((calc.parcelas.produto?.preco_un ?? 0) + (calc.parcelas.mo?.preco_un ?? 0)) * k;
  const preco_embalagem_sipi = (calc.parcelas.embalagem?.preco_un ?? 0) * k;
  const tributos_un = tributosDasParcelas(calc) * k;

  // IPI por fora: linear nas parcelas -> escala exatamente com k.
  // (k = 1 no cenário pelo motor: reproduz o resultado do Motor 2 ao centavo.)
  const ipi_un = calc.resultado.ipi_un * k;
  const icms_sobre_ipi = calc.resultado.icms_sobre_ipi * k;
  const preco_cipi = preco_sipi + ipi_un + icms_sobre_ipi;

  const preco: PrecoCenario = {
    origem: c.preco_venda_un == null ? 'motor2' : 'imposto',
    margem_pct: margem_pct == null ? null : r4(margem_pct),
    margem_origem,
    margem_escada_pct: escada.escada_pct,
    faixa_lote: escada.faixa_descricao,
    preco_produto_sipi: r4(preco_produto_sipi),
    preco_embalagem_sipi: r4(preco_embalagem_sipi),
    preco_sipi: r4(preco_sipi),
    ipi_pct: calc.resultado.ipi_pct,
    base_ipi: calc.resultado.base_ipi,
    ipi_un: r4(ipi_un),
    icms_sobre_ipi_un: r4(icms_sobre_ipi),
    preco_cipi: r4(preco_cipi),
    tributos_por_dentro_pct: preco_sipi > 0 ? r4((tributos_un / preco_sipi) * 100) : 0,
  };

  return { calc, tributos, k, tributos_un, preco, alertas };
}

// ============================================================================
// DRE / PE / PREÇOS MÍNIMOS
// ============================================================================

interface BaseEconomica {
  preco_sipi: number;
  taxa_efetiva: number; // fração dos tributos por dentro sobre o preço (0..1)
  custo_variavel_un: number; // mp_liquida + embalagem_liquida + frete
  mp_liquida_un: number;
  embalagem_liquida_un: number;
  frete_un: number;
  setup_ordem: number; // R$ por lote
  corrida_un: number;
  unidades_mes: number;
  lotes_mes: number;
  fixo_mes: number;
  depreciacao_mes: number;
  hora_extra_mes: number | null;
}

function dre(b: BaseEconomica, preco: number, meses: number): DreProjeto {
  const unidades = b.unidades_mes * meses;
  const lotes = b.lotes_mes * meses;
  const receita = preco * unidades;
  const tributos = receita * b.taxa_efetiva;
  const mp = b.mp_liquida_un * unidades;
  const emb = b.embalagem_liquida_un * unidades;
  const frete = b.frete_un * unidades;
  const variaveis = mp + emb + frete;
  const fabSetup = b.setup_ordem * lotes;
  const fabCorrida = b.corrida_un * unidades;
  const fabrica = fabSetup + fabCorrida;
  const he = b.hora_extra_mes == null ? null : b.hora_extra_mes * meses;
  const fixo = b.fixo_mes * meses;
  const dep = b.depreciacao_mes * meses;
  const fixosIncrementais = fixo + dep + (he ?? 0);
  const lucro = receita - tributos - variaveis - fabrica - fixosIncrementais;
  return {
    meses,
    unidades: r4(unidades),
    lotes: r4(lotes),
    receita_bruta_sipi: r2(receita),
    tributos_por_dentro: r2(tributos),
    receita_liquida: r2(receita - tributos),
    mp_liquida: r2(mp),
    embalagem_liquida: r2(emb),
    frete: r2(frete),
    custos_variaveis: r2(variaveis),
    fabrica_setup: r2(fabSetup),
    fabrica_corrida: r2(fabCorrida),
    fabrica: r2(fabrica),
    hora_extra: r2n(he),
    custo_fixo_incremental: r2(fixo),
    depreciacao: r2(dep),
    custos_incrementais_fixos: r2(fixosIncrementais),
    lucro_operacional: r2(lucro),
    margem_sobre_receita_pct: receita > 0 ? r4((lucro / receita) * 100) : null,
    fluxo_caixa_operacional: r2(lucro + dep),
  };
}

/** lucro (sem arredondar) ao preço p — função monótona crescente em p. */
function lucroAoPreco(b: BaseEconomica, p: number, meses: number): number {
  const un = b.unidades_mes * meses;
  const receita = p * un;
  return (
    receita * (1 - b.taxa_efetiva) -
    b.custo_variavel_un * un -
    b.setup_ordem * b.lotes_mes * meses -
    b.corrida_un * un -
    (b.fixo_mes + b.depreciacao_mes + (b.hora_extra_mes ?? 0)) * meses
  );
}

// ============================================================================
// AVALIAÇÃO DE UM CENÁRIO
// ============================================================================

function avaliarCenario(
  nome: 'ideal' | 'limite',
  c: PremissasCenario,
  ctx: ContextoViabilidade,
): ResultadoCenario {
  const { calc, tributos, tributos_un, preco, alertas } = precificar(c, ctx);
  const m = calc.material;
  const mo = calc.mao_de_obra;

  // ---------------- decomposição por unidade ----------------
  // fábrica EXATA (sem arredondar) — a mesma que o Motor 2 usa no preço.
  const prod = calcularCustoProducao(ctx.producao, c.un_min, c.quantidade);
  const preco_sipi = preco.preco_sipi;
  const fabrica_total = prod.custo_producao_un_exato;
  const corrida_un_exata = fabrica_total - prod.setup_un;
  const custo_total = m.mp_liquida + m.embalagem_liquida + m.frete + fabrica_total;
  const margem_brl = preco_sipi - tributos_un - custo_total;
  const mc = preco_sipi - tributos_un - m.mp_liquida - m.embalagem_liquida - m.frete;
  const unitario: DecomposicaoUnitaria = {
    mp_bruta: m.mp_bruta,
    perda: m.perda,
    credito_mp: m.credito_mp,
    mp_liquida: m.mp_liquida,
    embalagem_bruta: m.embalagem_bruta,
    credito_emb: m.credito_emb,
    embalagem_liquida: m.embalagem_liquida,
    frete: m.frete,
    fabrica_setup: mo.setup_un,
    fabrica_corrida: r4(corrida_un_exata),
    fabrica_total: r4(fabrica_total),
    custo_total: r4(custo_total),
    tributos_por_dentro: r4(tributos_un),
    ipi_por_fora: preco.ipi_un,
    margem_brl: r4(margem_brl),
    margem_sobre_preco_pct: preco_sipi > 0 ? r4((margem_brl / preco_sipi) * 100) : 0,
    margem_contribuicao: r4(mc),
    margem_contribuicao_com_absorcao: r4(mc - fabrica_total),
  };

  // ---------------- tempo de linha ----------------
  const setup_min = ctx.producao.setup_minutos;
  const corrida_min = c.quantidade / c.un_min;
  const minutos_lote = setup_min + corrida_min;
  const minutos_mes = minutos_lote * c.lotes_por_mes;
  const capacidade = prod.capacidade_normal_min_mes;
  const ocupacao_projeto = (minutos_mes / capacidade) * 100;
  const ocupacao_total = c.ocupacao_atual_pct == null ? null : c.ocupacao_atual_pct + ocupacao_projeto;
  const tempo_linha: TempoLinha = {
    setup_minutos: setup_min,
    corrida_minutos_lote: r4(corrida_min),
    minutos_lote: r4(minutos_lote),
    horas_lote: r4(minutos_lote / 60),
    dias_linha_lote: r4(minutos_lote / prod.minutos_produtivos_dia_linha),
    minutos_produtivos_dia_linha: prod.minutos_produtivos_dia_linha,
    horas_homem_lote: r4((minutos_lote * c.pessoas_por_linha) / 60),
    pessoas_por_linha: c.pessoas_por_linha,
    minutos_mes: r4(minutos_mes),
    horas_mes: r4(minutos_mes / 60),
    capacidade_normal_min_mes: capacidade,
    ocupacao_projeto_pct: r4(ocupacao_projeto),
    ocupacao_atual_pct: c.ocupacao_atual_pct,
    ocupacao_total_pct: r4n(ocupacao_total),
  };

  // ---------------- hora extra ----------------
  let hora_extra: HoraExtra = {
    avaliada: false,
    minutos_excedentes_mes: null,
    horas_linha_extra_mes: null,
    horas_pessoa_extra_mes: null,
    custo_hora_pessoa: c.custo_hora_extra_hora,
    custo_mes: null,
    teto_horas_mes: c.horas_extra_maximas_mes,
    excede_teto: false,
  };
  let he_mes: number | null = 0;
  if (ocupacao_total == null) {
    alertas.push({
      codigo: 'ocupacao_desconhecida',
      nivel: 'atencao',
      mensagem:
        'Ocupacao atual da fabrica nao informada: hora extra e capacidade nao foram avaliadas. ' +
        `O projeto sozinho ocupa ${r2(ocupacao_projeto)}% da capacidade normal.`,
    });
  } else {
    const excedentePct = Math.max(0, ocupacao_total - 100);
    const minutos_exc = (excedentePct / 100) * capacidade; // minutos PRODUTIVOS
    // minuto produtivo -> hora-relogio de linha: divide pela eficiencia.
    const horas_linha = minutos_exc / 60 / ctx.producao.eficiencia_producao;
    const horas_pessoa = horas_linha * c.pessoas_por_linha;
    const excede = c.horas_extra_maximas_mes != null && horas_linha > c.horas_extra_maximas_mes + 1e-9;
    let custo_mes: number | null = 0;
    if (minutos_exc > 0) {
      if (c.custo_hora_extra_hora == null) {
        custo_mes = null;
        he_mes = null;
        alertas.push({
          codigo: 'custo_he_nao_informado',
          nivel: 'atencao',
          mensagem:
            `O projeto exige ${r2(horas_linha)} h de linha extras/mes (${r2(horas_pessoa)} h-pessoa), ` +
            'mas o custo da hora extra nao foi informado: a DRE NAO inclui a hora extra.',
        });
      } else {
        custo_mes = horas_pessoa * c.custo_hora_extra_hora;
        he_mes = custo_mes;
      }
      if (excede) {
        alertas.push({
          codigo: 'capacidade_insuficiente',
          nivel: 'bloqueante',
          mensagem:
            `CAPACIDADE INSUFICIENTE: ocupacao total ${r2(ocupacao_total)}% exige ${r2(horas_linha)} h ` +
            `de linha extras/mes, acima do teto de ${c.horas_extra_maximas_mes} h/mes.`,
        });
      }
    }
    hora_extra = {
      avaliada: true,
      minutos_excedentes_mes: r4(minutos_exc),
      horas_linha_extra_mes: r4(horas_linha),
      horas_pessoa_extra_mes: r4(horas_pessoa),
      custo_hora_pessoa: c.custo_hora_extra_hora,
      custo_mes: r2n(custo_mes),
      teto_horas_mes: c.horas_extra_maximas_mes,
      excede_teto: excede,
    };
  }

  // ---------------- base econômica, DREs, payback ----------------
  const depreciacao_mes =
    c.investimento_brl > 0 ? c.investimento_brl / c.investimento_meses_depreciacao : 0;
  const base: BaseEconomica = {
    preco_sipi,
    taxa_efetiva: preco_sipi > 0 ? tributos_un / preco_sipi : 0,
    custo_variavel_un: m.mp_liquida + m.embalagem_liquida + m.frete,
    mp_liquida_un: m.mp_liquida,
    embalagem_liquida_un: m.embalagem_liquida,
    frete_un: m.frete,
    setup_ordem: mo.custo_setup_ordem,
    corrida_un: corrida_un_exata,
    unidades_mes: c.quantidade * c.lotes_por_mes,
    lotes_mes: c.lotes_por_mes,
    fixo_mes: c.custo_fixo_incremental_mes,
    depreciacao_mes,
    hora_extra_mes: he_mes,
  };
  const dre_mensal = dre(base, preco_sipi, 1);
  const dre_horizonte = dre(base, preco_sipi, c.horizonte_meses);

  const fluxo_mes = dre_mensal.lucro_operacional + dre_mensal.depreciacao;
  const payback =
    c.investimento_brl <= 0 ? 0 : fluxo_mes > 0 ? c.investimento_brl / fluxo_mes : null;
  const investimento = {
    valor: r2(c.investimento_brl),
    meses_depreciacao: c.investimento_meses_depreciacao,
    depreciacao_mes: r2(depreciacao_mes),
    payback_meses: r4n(payback),
    payback_dentro_do_horizonte: payback == null ? false : payback <= c.horizonte_meses,
  };

  // ---------------- ponto de equilíbrio (custos INCREMENTAIS) ----------------
  const fixosInc = c.custo_fixo_incremental_mes + depreciacao_mes + (he_mes ?? 0);
  const pe_un = mc > 0 ? fixosInc / mc : null;
  const mcAbs = mc - fabrica_total;
  const pe_un_abs = mcAbs > 0 ? fixosInc / mcAbs : null;
  const pe_lotes_ceil = pe_un == null ? null : Math.ceil(pe_un / c.quantidade - 1e-9);
  const ponto_equilibrio: PontoEquilibrio = {
    custos_fixos_incrementais_mes: r2(fixosInc),
    margem_contribuicao_un: r4(mc),
    unidades_mes: r4n(pe_un),
    lotes_mes: pe_un == null ? null : r4(pe_un / c.quantidade),
    producao_minima_lotes_mes: pe_lotes_ceil,
    producao_minima_unidades_mes: pe_lotes_ceil == null ? null : pe_lotes_ceil * c.quantidade,
    com_absorcao: {
      margem_contribuicao_un: r4(mcAbs),
      unidades_mes: r4n(pe_un_abs),
      lotes_mes: pe_un_abs == null ? null : r4(pe_un_abs / c.quantidade),
    },
  };

  // ---------------- preços mínimos (bisseção sobre o preço) ----------------
  const H = c.horizonte_meses;
  const hiPreco = Math.max(preco_sipi, 1) * 20 + 1000;
  let preco_viavel: number | null = null;
  if (lucroAoPreco(base, hiPreco, H) > 0) {
    preco_viavel = bissecao((p) => lucroAoPreco(base, p, H), 0, 0, hiPreco);
  }
  const mm = c.margem_minima_aceitavel_pct / 100;
  // margem(p) = lucro(p) / receita(p); g(p) = lucro(p) - mm x receita(p) e crescente em p.
  const g = (p: number) => lucroAoPreco(base, p, H) - mm * p * base.unidades_mes * H;
  let preco_mm: number | null = null;
  if (g(hiPreco) > 0) preco_mm = bissecao(g, 0, 0, hiPreco);
  const precos_minimos: PrecosMinimos = {
    viavel: r4n(preco_viavel),
    com_margem_minima: r4n(preco_mm),
    margem_minima_aceitavel_pct: c.margem_minima_aceitavel_pct,
    tolerancia: TOLERANCIA_BISSECAO,
  };

  // ---------------- alertas herdados do Motor 2 + do projeto ----------------
  if (calc.alertas.lote_minimo) {
    alertas.push({
      codigo: 'lote_minimo',
      nivel: 'bloqueante',
      mensagem: calc.alertas.lote_minimo.mensagem,
    });
  }
  if (calc.alertas.moq) {
    const a = calc.alertas.moq;
    alertas.push({
      codigo: 'moq',
      nivel: 'atencao',
      mensagem:
        `MOQ economico: custo do lote R$ ${a.custo_lote.toFixed(2)} (setup pesa ${a.peso_setup_pct}%). ` +
        `Lote minimo economico ~ ${a.quantidade_minima} un (R$ ${a.lote_minimo_valor.toFixed(2)}). Motivo: ${a.motivo}.`,
    });
  }
  if (c.cmp_base_mp_kg <= 0) {
    alertas.push({
      codigo: 'mp_sem_preco',
      nivel: 'atencao',
      mensagem: 'Custo da materia-prima = R$ 0/kg: o preco sai SUBESTIMADO. Informe o R$/kg da formula.',
    });
  } else if (calc.alertas.mp_sem_preco) {
    alertas.push({
      codigo: 'mp_sem_preco',
      nivel: 'atencao',
      mensagem: `${calc.alertas.mp_sem_preco.quantidade} MP sem preco na formula (${calc.alertas.mp_sem_preco.nomes.join(', ')}): custo subestimado.`,
    });
  }
  if (calc.alertas.embalagem_ignorada) {
    alertas.push({
      codigo: 'embalagem_ignorada',
      nivel: 'atencao',
      mensagem: calc.alertas.embalagem_ignorada.mensagem,
    });
  }
  // Cliente fora de SP: a matriz fiscal cobre so a operacao interna paulista
  // (espelha alertas.uf_fora_sp do calculo.service).
  if (c.perfil_fiscal.uf && c.perfil_fiscal.uf.toUpperCase() !== 'SP') {
    alertas.push({
      codigo: 'uf_fora_sp',
      nivel: 'atencao',
      mensagem:
        `Cliente em ${c.perfil_fiscal.uf}: a matriz fiscal cobre so a operacao interna de SP. ` +
        'Aliquotas interestaduais (7%/12%) e DIFAL NAO estao no preco - validar com o contador.',
    });
  }
  if (mc <= 0) {
    alertas.push({
      codigo: 'margem_contribuicao_negativa',
      nivel: 'bloqueante',
      mensagem:
        `Margem de contribuicao unitaria <= 0 (R$ ${r4(mc).toFixed(4)}): nao ha volume que pague os custos incrementais.`,
    });
  } else if (dre_mensal.lucro_operacional < 0) {
    alertas.push({
      codigo: 'prejuizo_mensal',
      nivel: 'atencao',
      mensagem:
        `Projeto da prejuizo de R$ ${Math.abs(dre_mensal.lucro_operacional).toFixed(2)}/mes no volume previsto` +
        (pe_lotes_ceil != null ? `; precisa de pelo menos ${pe_lotes_ceil} lote(s)/mes para empatar.` : '.'),
    });
  }
  if (
    dre_mensal.margem_sobre_receita_pct != null &&
    dre_mensal.margem_sobre_receita_pct < c.margem_minima_aceitavel_pct
  ) {
    alertas.push({
      codigo: 'margem_abaixo_da_minima',
      nivel: 'atencao',
      mensagem:
        `Margem do projeto ${r2(dre_mensal.margem_sobre_receita_pct)}% sobre a receita fica abaixo da minima ` +
        `aceitavel (${c.margem_minima_aceitavel_pct}%)` +
        (preco_mm != null ? `; preco minimo para a margem minima: R$ ${r2(preco_mm).toFixed(2)}.` : '.'),
    });
  }
  if (c.investimento_brl > 0 && (payback == null || payback > c.horizonte_meses)) {
    alertas.push({
      codigo: 'payback_acima_do_horizonte',
      nivel: 'atencao',
      mensagem:
        payback == null
          ? `Investimento de R$ ${r2(c.investimento_brl).toFixed(2)} nunca se paga (fluxo de caixa mensal <= 0).`
          : `Payback de ${r2(payback)} meses excede o horizonte de ${c.horizonte_meses} meses.`,
    });
  }

  return {
    nome,
    premissas: c,
    preco,
    unitario,
    tempo_linha,
    hora_extra,
    dre_mensal,
    dre_horizonte,
    investimento,
    ponto_equilibrio,
    precos_minimos,
    alertas,
    bloqueado: alertas.some((a) => a.nivel === 'bloqueante'),
    motor2: calc,
    tributos,
  };
}

// ============================================================================
// ESPELHO ideal x limite
// ============================================================================

function espelho(i: ResultadoCenario, l: ResultadoCenario): LinhaEspelho[] {
  const linha = (
    campo: string,
    rotulo: string,
    unidade: string,
    a: number | null,
    b: number | null,
  ): LinhaEspelho => ({
    campo,
    rotulo,
    unidade,
    ideal: a,
    limite: b,
    diferenca: a == null || b == null ? null : r4(b - a),
  });
  return [
    linha('preco_sipi', 'Preco unitario sem IPI', 'R$', i.preco.preco_sipi, l.preco.preco_sipi),
    linha('preco_cipi', 'Preco unitario com IPI', 'R$', i.preco.preco_cipi, l.preco.preco_cipi),
    linha('margem_pct', 'Margem aplicada (markup Motor 2)', '%', i.preco.margem_pct, l.preco.margem_pct),
    linha(
      'margem_sobre_receita_pct',
      'Margem do projeto sobre a receita',
      '%',
      i.dre_mensal.margem_sobre_receita_pct,
      l.dre_mensal.margem_sobre_receita_pct,
    ),
    linha('lucro_mes', 'Lucro operacional por mes', 'R$', i.dre_mensal.lucro_operacional, l.dre_mensal.lucro_operacional),
    linha(
      'lucro_horizonte',
      'Lucro operacional no horizonte',
      'R$',
      i.dre_horizonte.lucro_operacional,
      l.dre_horizonte.lucro_operacional,
    ),
    linha('pe_un_mes', 'Ponto de equilibrio (un/mes)', 'un', i.ponto_equilibrio.unidades_mes, l.ponto_equilibrio.unidades_mes),
    linha('ocupacao_pct', 'Ocupacao da capacidade pelo projeto', '%', i.tempo_linha.ocupacao_projeto_pct, l.tempo_linha.ocupacao_projeto_pct),
    linha('payback_meses', 'Payback do investimento', 'meses', i.investimento.payback_meses, l.investimento.payback_meses),
    linha('preco_minimo_viavel', 'Preco minimo viavel (lucro zero)', 'R$', i.precos_minimos.viavel, l.precos_minimos.viavel),
  ];
}

// ============================================================================
// ENTRADA PÚBLICA
// ============================================================================

export function avaliarViabilidade(
  premissas: PremissasViabilidade,
  ctx: ContextoViabilidade,
): ResultadoViabilidade {
  if (!premissas || !premissas.ideal) {
    throw new Error('Premissas obrigatorias ausentes: cenario ideal.');
  }
  const ideal = validarPremissas(premissas.ideal, 'ideal');
  const limite = mesclarLimite(ideal, premissas.limite);

  const rIdeal = avaliarCenario('ideal', ideal, ctx);
  const rLimite = avaliarCenario('limite', limite, ctx);

  const fundamentos = Array.from(new Set([...rIdeal.tributos.fundamentos, ...rLimite.tributos.fundamentos]));

  return sanitizarLatin1<ResultadoViabilidade>({
    engine: VIABILIDADE_ENGINE_ID,
    ideal: rIdeal,
    limite: rLimite,
    espelho: espelho(rIdeal, rLimite),
    premissas_usadas: [
      'Precos unitarios pelo Motor 2 10/26: MP liquida de credito, embalagem com taxa de gestao propria, escada de margem por lote, fabrica de 3 componentes.',
      'Densidade 1,0 g/mL: volume_un (mL) tratado como massa (g) para converter R$/kg em R$/un.',
      'Preco imposto: a margem (markup) e derivada por bissecao sobre o Motor 2 ate o preco bater (tolerancia 0,001). Abaixo do custo + tributos a margem e inviavel e o preco e mantido.',
      'Tributos por dentro em R$ = soma(preco da parcela x taxa da parcela); IPI por fora pelo NCM, na base do modo de operacao.',
      'Tempo de linha por lote = setup (min) + quantidade / un_min, em minutos PRODUTIVOS; dias de linha = minutos / (horas_dia x 60 x eficiencia).',
      'Horas-homem por lote = minutos de linha x pessoas_por_linha / 60.',
      'Ocupacao do projeto = lotes_por_mes x minutos por lote / capacidade normal (linhas x dias x horas x 60 x eficiencia).',
      'Hora extra: so avaliada com ocupacao atual informada; minutos excedentes convertidos em horas-relogio de linha (/ eficiencia); custo = horas de linha x pessoas_por_linha x custo por pessoa-hora.',
      'DRE do projeto: receita bruta sem IPI; fabrica por absorcao (setup por lote + corrida por unidade na taxa/minuto vigente); depreciacao linear = investimento / meses.',
      'Payback = investimento / (lucro operacional mensal + depreciacao); null quando o fluxo de caixa mensal e <= 0.',
      'Ponto de equilibrio incremental = (custo fixo incremental + depreciacao + hora extra) / margem de contribuicao unitaria (preco - tributos - MP - embalagem - frete); "com absorcao" desconta tambem a fabrica.',
      'Producao minima para dar lucro = ponto de equilibrio em unidades arredondado para cima em lotes inteiros.',
      'Precos minimos por bissecao sobre o preco: lucro no horizonte = 0 e margem do projeto = margem minima aceitavel; os tributos por dentro mantem a proporcao das parcelas do cenario.',
      'O cenario limite herda todas as premissas do ideal e sobrescreve apenas o que foi informado.',
    ],
    fundamentos,
    vigencias_parametros: ctx.vigencias,
    contexto: {
      producao: ctx.producao,
      fiscal: ctx.fiscal,
      caracterizacao: ctx.caracterizacao,
      escada: ctx.escada,
      lote_minimo_un: ctx.lote_minimo_un,
    },
  });
}

/** Resumo curto para listas e audit_log. Tolerante a resultado antigo/parcial. */
export function resumoViabilidade(resultado: unknown): {
  ideal: ResumoCenario | null;
  limite: ResumoCenario | null;
} {
  const r = resultado as Partial<ResultadoViabilidade> | null | undefined;
  const pick = (c?: ResultadoCenario): ResumoCenario | null =>
    c && c.preco && c.dre_mensal
      ? {
          preco_sipi: c.preco.preco_sipi,
          preco_cipi: c.preco.preco_cipi,
          margem_pct: c.preco.margem_pct,
          lucro_mes: c.dre_mensal.lucro_operacional,
          margem_sobre_receita_pct: c.dre_mensal.margem_sobre_receita_pct,
          bloqueado: !!c.bloqueado,
        }
      : null;
  return { ideal: pick(r?.ideal), limite: pick(r?.limite) };
}

export interface ResumoCenario {
  preco_sipi: number;
  preco_cipi: number;
  margem_pct: number | null;
  lucro_mes: number;
  margem_sobre_receita_pct: number | null;
  bloqueado: boolean;
}
