/**
 * Tipos de dominio compartilhados (espelham os DTOs/entidades do backend).
 * Campos Decimal do Prisma chegam como string no JSON — modelados como Money.
 */
import type { Role } from '@/auth/auth-context';

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

/** Item de composição para escrita (espelha ComposicaoItemDto do backend). */
export interface ComposicaoItemInput {
  fase?: string;
  ordem?: number;
  mp_id?: number;
  mp_nome_original?: string;
  concentracao_pct: number;
  funcao?: string;
  fornecedor_pref?: string;
}

/** Payload de nova versão de fórmula (POST /formulas/:id/nova-versao). */
export interface NovaVersaoPayload {
  versao_descricao?: string;
  composicao: ComposicaoItemInput[];
}

// ----------------------- ORCAMENTOS -----------------------

export const NIVEIS_ORCAMENTO = ['basic', 'inter', 'premium'] as const;
export type NivelOrcamento = (typeof NIVEIS_ORCAMENTO)[number];

/** Rótulos amigáveis dos níveis (Doc 2d §C). */
export const NIVEL_ORCAMENTO_LABEL: Record<NivelOrcamento, string> = {
  basic: 'Basic',
  inter: 'Intermediário',
  premium: 'Premium',
};

/**
 * Status do orçamento (Doc 2c). Transições de status têm endpoints próprios
 * (fora do escopo do wizard Dia 11) — aqui usamos só 'rascunho' na criação.
 */
export type StatusOrcamento =
  | 'rascunho'
  | 'aprovado_interno'
  | 'enviado'
  | 'aprovado_cliente'
  | 'em_amostragem'
  | 'em_producao'
  | 'concluido'
  | 'rejeitado'
  | 'arquivado';

/** Rótulos dos status para badges. */
export const STATUS_ORCAMENTO_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  aprovado_interno: 'Aprovado interno',
  enviado: 'Enviado',
  aprovado_cliente: 'Aprovado cliente',
  em_amostragem: 'Em amostragem',
  em_producao: 'Em produção',
  concluido: 'Concluído',
  rejeitado: 'Rejeitado',
  arquivado: 'Arquivado',
};

/** Item da listagem (GET /orcamentos) — inclui cliente resumido. */
export interface OrcamentoListItem {
  id: string;
  numero: number;
  cliente_id: string | null;
  produto: string;
  categoria: string | null;
  nivel: NivelOrcamento | null;
  status: StatusOrcamento | string;
  volume_un: Money;
  quantidade: number | null;
  margem_pct: Money;
  formula_id: number | null;
  score_global: number | null;
  preco_sipi: Money;
  preco_cipi: Money;
  created_at: string;
  cliente: { id: string; nome: string } | null;
}

// ---- JSON_CALC travado (espelha calculo.service.ts → gerarCalculo) ----

export interface CalculoInputs {
  cmp_base_mp_kg: number;
  volume_un: number;
  quantidade: number;
  un_min: number;
  margem_pct: number;
  mp_frag_kg: number;
  embalagem_un: number;
}

export interface CalculoParametros {
  mo_folha_mensal: number;
  mo_dias_uteis: number;
  imposto_mp_pct: number;
  imposto_mo_pct: number;
  ipi_pct: number;
  desvio_mp_pct: number;
  frete_un_brl: number;
}

export interface CalculoCustoMp {
  mp_base: number;
  mp_frag: number;
  desvio_pct: number;
  desvio: number;
  embalagem: number;
  frete: number;
  cmp_simp: number;
  imposto_mp_pct: number;
  cmp_cimp: number;
}

export interface CalculoMaoDeObra {
  mo_folha_mensal: number;
  mo_dias_uteis: number;
  mo_diario: number;
  un_min: number;
  producao_diaria: number;
  dias_necessarios: number;
  mo_lote: number;
  mo_un: number;
  imposto_mo_pct: number;
  cmo_cimp: number;
}

export interface CalculoResultado {
  custo_total: number;
  margem_pct: number;
  preco_sipi: number;
  ipi_pct: number;
  ipi_un: number;
  preco_cipi: number;
}

/** Snapshot do cálculo determinístico travado no orçamento (Fase 1, Doc 2d). */
export interface CalculoJson {
  _mode: string;
  _modelo_versao: string;
  _gerado_em: string;
  _preliminar?: boolean;
  _aviso?: string;
  inputs: CalculoInputs;
  parametros: CalculoParametros;
  custo_mp: CalculoCustoMp;
  mao_de_obra: CalculoMaoDeObra;
  resultado: CalculoResultado;
  score_global: number;
  faixa: string;
  formula_usada: {
    id: number;
    nome: string;
    versao: string | null;
    status: string;
    origem: string;
  } | null;
  embalagem: {
    id?: number;
    nome?: string;
    tipo?: string;
    preco_un_brl?: number | null;
    fornecedor?: string | null;
    preco_estimado?: boolean;
  } | null;
  ingredientes: {
    nome: string | null;
    mp_codigo: number | null;
    concentracao_pct: number;
    preco_kg_atual: number | null;
    custo_na_formula: number | null;
    score: number;
    fase: string | null;
  }[];
}

/** Detalhe do orçamento (GET /orcamentos/:id). */
export interface OrcamentoDetalhe {
  id: string;
  numero: number;
  cliente_id: string | null;
  produto: string;
  categoria: string | null;
  nivel: NivelOrcamento | null;
  volume_un: Money;
  quantidade: number | null;
  margem_pct: Money;
  formula_id: number | null;
  embalagem: string | null;
  budget_mp: Money;
  produto_referencia: string | null;
  status: StatusOrcamento | string;
  un_min: Money;
  embalagem_id: number | null;
  embalagem_snapshot: CalculoJson['embalagem'] | null;
  sem_embalagem: boolean;
  calculo: CalculoJson | null;
  formula_versao_codigo: string | null;
  formula_status_momento: string | null;
  requer_amostra: boolean;
  amostra_status: string;
  amostra_qtd: number | null;
  score_global: number | null;
  preco_sipi: Money;
  preco_cipi: Money;
  created_at: string;
  updated_at: string;
  cliente: { id: string; nome: string } | null;
  formula: { id: number; nome_produto: string; versao_codigo: string | null; status: string } | null;
}

// ---- Match de fórmulas (POST /orcamentos/match-formulas) ----

/** Candidata ranqueada do match híbrido (custo R$0) — Doc 2d §C2. */
export interface Candidata {
  formula_id: number;
  nome_produto: string;
  categoria: string | null;
  status: string;
  versao_codigo: string | null;
  custo_mp_kg: number | null;
  n_orcamentos: number;
  rank_textual: number;
  validada_recente: boolean;
  score: number;
  justificativa_ia?: string;
}

export interface MatchResposta {
  match_id: number;
  modo: string;
  custo: number;
  candidatas: Candidata[];
}

export interface RefinarIaResposta {
  match_id: number;
  modo: string;
  custo_estimado_brl: number;
  top_5_reranqueado: Candidata[];
}

// ----------------------- ADMIN -----------------------

/** Rótulos amigáveis dos papéis (enum Role do backend). */
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  comercial: 'Comercial',
  pd: 'P&D',
  compras: 'Compras',
  producao: 'Produção',
};

/** Lista de papéis para selects (mesma ordem do enum Prisma). */
export const ROLES: Role[] = ['admin', 'comercial', 'pd', 'compras', 'producao'];

/** Usuário (GET /users — nunca traz password_hash). */
export interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/** Parâmetros do sistema (GET /system-config). */
export interface SystemConfig {
  id: number;
  mo_folha_mensal: Money;
  mo_dias_uteis: number;
  mo_colaboradores: number;
  imposto_mp_pct: Money;
  imposto_mo_pct: Money;
  ipi_pct: Money;
  desvio_mp_pct: Money;
  frete_un_brl: Money;
  alerta_aumento_mp_pct: Money;
  alertas_ativos: boolean;
  produtividade_etapas?: unknown;
  updated_at: string;
}

export type SeveridadeAlerta = 'info' | 'warn' | 'critical';

/** Alerta (GET /alertas) — `lido` calculado para o usuário atual. */
export interface Alerta {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  entidade_tipo: string | null;
  entidade_id: number | null;
  severidade: SeveridadeAlerta | string;
  resolvido: boolean;
  created_at: string;
  lido: boolean;
  created_for?: string[];
}

// ----------------------- MATRIZ DE CUSTO (F5) -----------------------

/**
 * Visão da Matriz de Custo (GET /matriz-custo → montarView).
 * Numéricos já chegam como number (o backend converte Decimal via toNum) — não
 * são string como nos demais Money. `mo_dias_uteis` e `encomendante_simples` vêm
 * crus (Int/bool). `fiscais_provisorios` é irmão de operacional/fiscal, NÃO está
 * dentro de fiscal. `derivados` é READ-ONLY (recalculado pelo backend).
 */
export interface MatrizCustoView {
  operacional: {
    custo_fixo_mensal: number | null;
    mo_dias_uteis: number; // Int cru (não passa por toNum)
    horas_dia: number | null;
    eficiencia_linha: number | null; // fração 0..1, não %
    desvio_mp_pct: number | null;
    frete_un_brl: number | null;
    margem_padrao_pct: number | null;
  };
  fiscal: {
    icms_regime: number | null;
    encomendante_simples: boolean;
    pis_cofins_monofasico_pct: number | null;
    pis_cofins_servico_pct: number | null;
  };
  fiscais_provisorios: boolean;
  derivados: {
    minutos_produtivos: number | null;
    custo_minuto: number | null;
  };
}

/** PATCH /matriz-custo/operacional (espelha UpdateOperacionalDto — parcial). */
export interface UpdateOperacionalPayload {
  custo_fixo_mensal?: number;
  mo_dias_uteis?: number;
  horas_dia?: number;
  eficiencia_linha?: number;
  desvio_mp_pct?: number;
  frete_un_brl?: number;
  margem_padrao_pct?: number;
}

/** PATCH /matriz-custo/fiscal (espelha UpdateFiscalDto — parcial). */
export interface UpdateFiscalPayload {
  icms_regime?: number;
  encomendante_simples?: boolean;
  pis_cofins_monofasico_pct?: number;
  pis_cofins_servico_pct?: number;
  fiscais_provisorios?: boolean;
}
