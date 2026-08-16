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

export type RegimeFiscalCliente = 'simples' | 'lucro_real_presumido' | 'consumidor_final_cpf';
export type FinalidadeCliente = 'revenda' | 'industrializacao' | 'uso_proprio';

export interface Cliente {
  id: string;
  nome: string;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
  created_by: string | null;
  // F4 Fase A (D3) — perfil fiscal. null = não informado (matriz trata como pior caso)
  regime_fiscal: RegimeFiscalCliente | null;
  finalidade_padrao: FinalidadeCliente | null;
  uf: string | null;
  contribuinte_icms: boolean | null;
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
  | 'recusado'
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
  // 'recusado' é o status REAL que a máquina do backend escreve (P1). O
  // 'rejeitado' abaixo é rótulo legado do Doc 2c que nenhum código atribui —
  // mantido para não quebrar registro histórico; remoção é decisão de produto.
  recusado: 'Recusado',
  em_amostragem: 'Em amostragem',
  em_producao: 'Em produção',
  concluido: 'Concluído',
  rejeitado: 'Rejeitado',
  arquivado: 'Arquivado',
};

/**
 * FASE 3 — motivo categorizado da recusa. `formula` é o único que dispara a
 * criação de uma pendência de revisão no laboratório.
 */
export const MOTIVOS_RECUSA = ['preco_custo', 'formula', 'prazo', 'outro'] as const;
export type MotivoRecusa = (typeof MOTIVOS_RECUSA)[number];

export const MOTIVO_RECUSA_LABEL: Record<string, string> = {
  preco_custo: 'Preço / custo',
  formula: 'Fórmula',
  prazo: 'Prazo',
  outro: 'Outro',
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
  embalagem_un: number;
}

export interface CalculoParametrosOperacionais {
  mo_folha_mensal: number;
  mo_dias_uteis: number;
  desvio_mp_pct: number;
  frete_un_brl: number;
}

export interface CalculoParametrosFiscais {
  pis_monofasico_pct: number;
  cofins_monofasico_pct: number;
  pis_comum_pct: number;
  cofins_comum_pct: number;
  icms_carga_art34_pct: number;
  icms_nominal_padrao_pct: number;
}

export interface CalculoNcm {
  codigo: string;
  ex_tipi: string;
  ipi_pct: number;
  monofasico: boolean;
  tratamento: string;
}

/** Custo de material por unidade (SEM colchão de imposto — F4 corte). */
export interface CalculoMaterial {
  mp_base: number;
  desvio: number;
  embalagem: number;
  frete: number;
  custo_material_un: number;
}

/**
 * MO do cálculo v3. Duas formas coexistem e o renderer tolera as duas:
 *  - 3.1 (corte F3, rodada 2): taxa_minuto + setup_un + corrida_un.
 *  - 3.0 (pré-corte): mo_diario + dias_necessarios (o artefato do ceil).
 * Snapshot congelado NUNCA é reescrito — orçamento antigo mantém a forma dele.
 */
export interface CalculoMaoDeObra {
  producao_diaria: number;
  mo_un: number;
  // ---- forma 3.1 (modelo de 3 componentes) ----
  taxa_minuto?: number;
  custo_setup_ordem?: number;
  minutos_produtivos_dia_linha?: number;
  setup_un?: number;
  corrida_un?: number;
  // ---- forma 3.0 (histórico, com ceil de dia inteiro) ----
  mo_diario?: number;
  dias_necessarios?: number;
}

/**
 * Alertas DERIVADOS no cálculo (não bloqueiam, não mudam preço).
 * Ausentes em snapshots anteriores ao red team — por isso opcionais.
 */
export interface AlertaMoq {
  custo_lote: number;
  peso_setup_pct: number;
  lote_minimo_valor: number;
  quantidade_minima: number;
  motivo: 'abaixo_do_valor_minimo' | 'setup_acima_do_teto' | 'ambos';
}

export interface CalculoAlertas {
  moq: AlertaMoq | null;
  mp_sem_preco: { quantidade: number; nomes: string[] } | null;
}

/** Parcela precificada (material ou MO): custo, tributos "por dentro", preço. */
export interface CalculoParcela {
  custo_un: number;
  taxa_pct: number;
  preco_un: number;
}

export interface CalculoResultado {
  margem_pct: number;
  preco_sipi: number;
  ipi_pct: number;
  base_ipi: 'total' | 'material' | 'nao_aplica';
  ipi_un: number;
  icms_sobre_ipi: number;
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
  modo_operacao: 'full_service' | 'hibrido' | 'industrializacao';
  ncm: CalculoNcm;
  perfil_fiscal: {
    regime_fiscal: string | null;
    finalidade: string | null;
    uf: string | null;
    contribuinte_icms: boolean | null;
  };
  parametros_operacionais: CalculoParametrosOperacionais;
  parametros_fiscais: CalculoParametrosFiscais;
  material: CalculoMaterial;
  mao_de_obra: CalculoMaoDeObra;
  /** opcional: snapshots anteriores ao red team não têm o bloco */
  alertas?: CalculoAlertas;
  parcelas: { material: CalculoParcela | null; mo: CalculoParcela | null };
  resultado: CalculoResultado;
  fundamentos: string[];
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

/**
 * Forma LEGADA do JSON_CALC (engine pré-corte F4, _modelo_versao 2.0). Orçamentos
 * calculados antes do corte guardam esta forma; NUNCA são reescritos (fronteira
 * fiscal×preço, tese 2). O renderer os exibe como histórico, sem quebrar.
 */
export interface CalculoJsonLegacy {
  _mode: string;
  _modelo_versao: string;
  _gerado_em?: string;
  _preliminar?: boolean;
  _aviso?: string;
  custo_mp: {
    mp_base: number;
    desvio_pct: number;
    desvio: number;
    embalagem: number;
    frete: number;
    imposto_mp_pct: number;
    cmp_cimp: number;
  };
  mao_de_obra: {
    producao_diaria: number;
    dias_necessarios: number;
    mo_un: number;
    imposto_mo_pct: number;
    cmo_cimp: number;
  };
  resultado: {
    custo_total: number;
    margem_pct: number;
    preco_sipi: number;
    ipi_pct: number;
    ipi_un: number;
    preco_cipi: number;
  };
  parametros: { ipi_pct: number; imposto_mp_pct: number; imposto_mo_pct: number };
  score_global: number;
  /** snap da embalagem resolvido no cálculo — fallback do briefing (bug #50). */
  embalagem?: { nome?: string } | null;
}

/** Discrimina v3 (fiscal granular, tem `material`+`ncm`) de v1 legado. */
export function isCalculoV3(c: CalculoJson | CalculoJsonLegacy): c is CalculoJson {
  return (c as CalculoJson).material !== undefined && (c as CalculoJson).ncm !== undefined;
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
  modo_operacao: 'full_service' | 'hibrido' | 'industrializacao' | null; // F4 Fase A; null = full_service
  embalagem: string | null;
  budget_mp: Money;
  produto_referencia: string | null;
  status: StatusOrcamento | string;
  // FASE 3 — motivo categorizado da recusa (só preenchido quando recusado).
  recusa_motivo: MotivoRecusa | null;
  recusa_observacao: string | null;
  recusa_em: string | null;
  un_min: Money;
  embalagem_id: number | null;
  embalagem_snapshot: CalculoJson['embalagem'] | null;
  sem_embalagem: boolean;
  calculo: CalculoJson | CalculoJsonLegacy | null;
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
  formula:
    | {
        id: number;
        nome_produto: string;
        versao_codigo: string | null;
        status: string;
        ncm_id: number | null;
        ncm: Pick<Ncm, 'id' | 'ncm' | 'descricao' | 'ipi_pct' | 'monofasico'> | null;
      }
    | null;
  // NCM (F3 override + F5 Bloco D) — efetivo computado READ-ONLY pelo findOne
  ncm_id: number | null; // override do próprio orçamento (null = herda da fórmula)
  ncm: Pick<Ncm, 'id' | 'ncm' | 'descricao' | 'ipi_pct' | 'monofasico'> | null; // objeto do override
  ncm_efetivo: number | null; // override ?? formula ?? null
  ncm_efetivo_origem: 'orcamento' | 'formula' | null;
}

// ---- Dashboard — stats de orçamentos (GET /orcamentos/stats) ----
export interface OrcamentoStats {
  por_status: { status: string; count: number }[];
  por_mes: { mes: string; count: number }[];
}

// ---- Amostras (pipeline — GET /amostras/pipeline) ----
export interface AmostraPipelineItem {
  id: string;
  numero: number;
  produto: string;
  amostra_status: string;
  amostra_qtd: number | null;
  cliente: { id: string; nome: string } | null;
  amostra_responsavel: { nome: string } | null;
}
export interface AmostraPipeline {
  total: number;
  grupos: { status: string; itens: AmostraPipelineItem[] }[];
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
  /** matches REAIS (rank_textual > 0) — corte de relevância no backend. */
  candidatas: Candidata[];
  /** fallback honesto: mais usadas quando NÃO há match; rotular como "por uso". */
  sugestoes_por_uso: Candidata[];
}

export interface RefinarIaResposta {
  match_id: number;
  modo: string;
  custo_estimado_brl: number;
  top_5_reranqueado: Candidata[];
}

// ----------------------- JORNADA DE LABORATÓRIO -----------------------

export type TipoPendencia = 'formulacao_nova' | 'revisao';
export type UrgenciaLab = 'mesmo_dia' | 'dois_tres_dias' | 'ate_sete_dias';
export type StatusPendencia = 'aberta' | 'em_atendimento' | 'concluida' | 'cancelada';

export interface PendenciaLab {
  id: number;
  tipo: TipoPendencia;
  status: StatusPendencia;
  urgencia: UrgenciaLab;
  prazo_limite: string;
  descricao: string;
  motivo_origem: string | null;
  solicitada_em: string;
  atendida_em: string | null;
  concluida_em: string | null;
  atrasada: boolean; // derivado no backend
  ncm_proposto: { id: number; ncm: string; ex_tipi: string; descricao: string } | null;
  orcamento: { id: string; numero: number; produto: string | null; status: string } | null;
  formula_base: { id: number; nome_produto: string; versao_codigo: string | null } | null;
  formula_resultado: {
    id: number;
    nome_produto: string;
    versao_codigo: string | null;
    status: string;
  } | null;
}

export interface CriarPendenciaPayload {
  tipo: TipoPendencia;
  urgencia: UrgenciaLab;
  descricao: string;
  ncm_proposto_id?: number; // obrigatório p/ formulacao_nova (D6)
  orcamento_id?: string;
  formula_base_id?: number;
  motivo_origem?: string;
}

/** FASE 4 — GET /pendencias-lab/indicadores. Atraso derivado na requisição. */
export interface TempoUrgenciaLab {
  urgencia: UrgenciaLab | string;
  n: number;
  media_horas: number | null; // null quando n=0 — nunca "0h"
  mediana_horas: number | null;
  valores_horas: number[]; // crus e ordenados — o front lista quando n<3
}

export interface IndicadoresLab {
  atrasadas: number;
  por_status: Record<string, number>; // aberta/em_atendimento/concluida/cancelada sempre presentes
  tempos: TempoUrgenciaLab[];
  /** concluídas sem concluida_em — fora do cálculo, visíveis aqui (nunca somem). */
  excluidas: number;
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

/** Linha de NCM (GET /matriz-custo/ncm). Soft-delete via ativo=false. */
export interface Ncm {
  id: number;
  ncm: string;
  descricao: string;
  ipi_pct: number;
  monofasico: boolean;
  provisorio: boolean;
  ativo: boolean;
  // F4 Fase A (D5) — cadastro fiscal completo
  ex_tipi: string; // '' = sem EX
  tratamento: 'tributado' | 'aliquota_zero' | 'suspenso' | 'isento' | 'nao_tributado';
  icms_nominal_pct: number | null;
  fundamento_legal: string | null;
}

/** Parâmetro fiscal versionado (F4 Fase A, D4). Nova vigência = nova linha. */
export interface ParametroFiscal {
  id: number;
  chave: string;
  valor: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  fundamento_legal: string;
  vigente: boolean;
}

export interface CreateParametroFiscalPayload {
  chave: string;
  valor: number;
  vigencia_inicio: string;
  fundamento_legal: string;
}

/** Item da fila de revisão fórmula->NCM (GET /formulas/pendentes-ncm). */
export interface FormulaPendenteNcm {
  id: number;
  nome_produto: string;
  versao_codigo: string | null;
  categoria: string | null;
  status: string;
  ncm_id: number;
  ncm: Pick<Ncm, 'id' | 'ncm' | 'descricao' | 'ipi_pct' | 'monofasico' | 'ativo'>;
}
