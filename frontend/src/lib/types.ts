/**
 * Tipos de dominio compartilhados (espelham os DTOs/entidades do backend).
 * Campos Decimal do Prisma chegam como string no JSON — modelados como Money.
 */

/** Valor monetario/decimal serializado pelo Prisma (string) ou nulo. */
export type Money = string | number | null;

/** Envelope de paginacao server-side (embalagens, mps, formulas). */
export interface Paginado<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ----------------------- EMBALAGENS -----------------------

export const TIPOS_EMBALAGEM = [
  'frasco',
  'pump',
  'tampa',
  'cartucho',
  'valvula',
  'celofane',
  'caixa',
  'rotulo',
  'outro',
] as const;
export type TipoEmbalagem = (typeof TIPOS_EMBALAGEM)[number];

/** Rotulos amigaveis dos tipos de embalagem (apresentacao). */
export const TIPO_EMBALAGEM_LABEL: Record<string, string> = {
  frasco: 'Frasco',
  pump: 'Pump',
  tampa: 'Tampa',
  cartucho: 'Cartucho',
  valvula: 'Válvula',
  celofane: 'Celofane',
  caixa: 'Caixa',
  rotulo: 'Rótulo',
  outro: 'Outro',
};

export interface Embalagem {
  id: number;
  codigo: string | null;
  nome: string;
  tipo: TipoEmbalagem;
  volume_ml: Money;
  material: string | null;
  cor: string | null;
  preco_un_brl: Money;
  fornecedor: string | null;
  prazo_entrega: string | null;
  preco_estimado: boolean;
  data_cotacao: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_by: string;
}

export interface EmbHistoricoPreco {
  id: number;
  embalagem_id: number;
  preco_un_brl: Money;
  preco_anterior_un: Money;
  variacao_pct: Money;
  fornecedor: string | null;
  data_cotacao: string;
  origem: string;
  fonte_info: string | null;
  observacoes: string | null;
  registrado_em: string;
  registrador?: { nome: string } | null;
}

export interface OrcamentoResumo {
  id: number;
  numero: number;
  produto: string | null;
  status: string;
  preco_cipi?: Money;
}

// ----------------------- MATERIAS-PRIMAS -----------------------

export interface MateriaPrima {
  id: number;
  codigo: number;
  nome: string;
  preco_kg_brl: Money;
  preco_anterior: Money;
  aumento_pct: Money;
  fornecedor: string | null;
  embalagem_minima: string | null;
  data_cotacao: string | null;
  validade_cotacao: string | null;
  n_formulas_uso: number;
  validado_pd: boolean;
  validado_compras: boolean;
  ativo: boolean;
  flag_aumento_relevante: boolean;
  observacoes: string | null;
}

export interface MpHistoricoPreco {
  id: number;
  mp_id: number;
  preco_kg_brl: Money;
  preco_anterior_kg: Money;
  variacao_pct: Money;
  fornecedor: string | null;
  data_cotacao: string;
  origem: string;
  fonte_info: string | null;
  observacoes: string | null;
  registrado_em: string;
  registrador?: { nome: string } | null;
}

/** Ponto do grafico de historico (GET /mps/:codigo/historico/grafico). */
export interface PontoHistorico {
  data: string;
  preco: number;
  origem: string;
}

export interface FormulaQueUsa {
  id: number;
  nome_produto: string;
  versao_codigo: string | null;
  status: string;
  categoria: string | null;
  custo_mp_kg: Money;
}

// ----------------------- CLIENTES -----------------------

export interface Cliente {
  id: string;
  nome: string;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
  created_by: string | null;
}

export interface ClienteDetalhe extends Cliente {
  orcamentos: {
    id: number;
    numero: number;
    produto: string | null;
    status: string;
    created_at: string;
  }[];
}

// ----------------------- FORMULAS -----------------------

export type StatusFormula = 'rascunho' | 'validada' | 'arquivada';
export type OrigemFormula = 'banco_original' | 'ia_gerada' | 'pd_manual';

/** Item da listagem de formulas (com _count.versoes quando maes=true). */
export interface FormulaListItem {
  id: number;
  nome_produto: string;
  versao_codigo: string | null;
  versao_descricao: string | null;
  categoria: string | null;
  origem: OrigemFormula | string;
  status: StatusFormula | string;
  cliente_id: string | null;
  custo_mp_kg: Money;
  formula_mae_id: number | null;
  total_ingredientes: number | null;
  _count?: { versoes: number };
}

/** Resultado da busca GIN (GET /formulas/buscar) — subconjunto + rank. */
export interface FormulaBuscaItem {
  id: number;
  nome_produto: string;
  versao_codigo: string | null;
  status: StatusFormula | string;
  origem: OrigemFormula | string;
  categoria: string | null;
  rank: number;
}

export interface ComposicaoItem {
  id: number;
  formula_id: number;
  fase: string | null;
  ordem: number | null;
  mp_id: number | null;
  mp_nome_original: string | null;
  concentracao_pct: Money;
  funcao: string | null;
  fornecedor_pref: string | null;
  preco_kg_snapshot: Money;
  custo_na_formula_snapshot: Money;
  mp?: { codigo: number; nome: string; preco_kg_brl: Money; data_cotacao: string | null } | null;
}

export interface CustoFormula {
  custo_mp_kg_atual: number;
  custo_mp_kg_snapshot: number | null;
  delta_pct: number | null;
  score_global: number;
  ingredientes: {
    mp_id: number | null;
    mp_codigo: number | null;
    nome: string | null;
    sem_match: boolean;
    fase: string | null;
    concentracao_pct: number;
    preco_kg_atual: number | null;
    custo_na_formula: number | null;
    score: number;
  }[];
}

export interface FormulaDetalhe extends FormulaListItem {
  observacoes: string | null;
  composicao: ComposicaoItem[];
  cliente: { id: string; nome: string } | null;
  validador: { nome: string } | null;
  formula_mae: { id: number; nome_produto: string; versao_codigo: string | null } | null;
  custo: CustoFormula;
}

export interface VersaoFormula {
  id: number;
  nome_produto: string;
  versao_codigo: string | null;
  versao_descricao: string | null;
  status: string;
  origem: string;
  derivada_de_id: number | null;
  custo_mp_kg: Money;
  validada_em: string | null;
}

export interface VersoesResposta {
  raiz_id: number;
  total: number;
  versoes: VersaoFormula[];
}
