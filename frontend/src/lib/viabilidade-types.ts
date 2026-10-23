/**
 * Tipos da Análise de Viabilidade de Projetos — espelham
 * backend/src/viabilidade/viabilidade-engine.ts (resultado) e os DTOs.
 */
import type { FinalidadeCliente, RegimeFiscalCliente } from '@/lib/types';

export type ModoOperacaoViab = 'full_service' | 'hibrido' | 'industrializacao';
export type StatusProjetoViabilidade = 'rascunho' | 'analisado' | 'aprovado' | 'descartado';
export type TratamentoIpiViab = 'tributado' | 'aliquota_zero' | 'suspenso' | 'isento' | 'nao_tributado';

export interface PerfilFiscalViab {
  regime_fiscal: RegimeFiscalCliente | null;
  finalidade: FinalidadeCliente | null;
  uf: string | null;
  contribuinte_icms: boolean | null;
}

export interface NcmViab {
  ncm: string;
  ex_tipi: string;
  ipi_pct: number;
  monofasico: boolean;
  tratamento: TratamentoIpiViab;
  icms_nominal_pct: number | null;
}

/** Premissas de UM cenário (todas ajustáveis). */
export interface PremissasCenario {
  produto: string;
  volume_un: number;
  quantidade: number;
  lotes_por_mes: number;
  un_min: number;
  cmp_base_mp_kg: number;
  perda_mp_pct: number;
  credito_mp_pct: number;
  credito_emb_pct: number;
  embalagem_un: number;
  taxa_gestao_embalagem_pct: number;
  frete_un_brl: number;
  modo_operacao: ModoOperacaoViab;
  perfil_fiscal: PerfilFiscalViab;
  ncm: NcmViab;
  margem_pct: number | null;
  preco_venda_un: number | null;
  investimento_brl: number;
  investimento_meses_depreciacao: number;
  custo_fixo_incremental_mes: number;
  horizonte_meses: number;
  margem_minima_aceitavel_pct: number;
  pessoas_por_linha: number;
  ocupacao_atual_pct: number | null;
  custo_hora_extra_hora: number | null;
  horas_extra_maximas_mes: number | null;
  mp_sem_preco?: string[];
}

export interface PremissasViabilidade {
  ideal: PremissasCenario;
  /** parcial: undefined herda do ideal. A tela envia o cenário completo. */
  limite?: Partial<PremissasCenario> | null;
}

// ------------------------------ resultado ------------------------------

export type NivelAlerta = 'bloqueante' | 'atencao';
export interface AlertaViabilidade {
  codigo: string;
  nivel: NivelAlerta;
  mensagem: string;
}

export interface PrecoCenario {
  origem: 'motor2' | 'imposto';
  margem_pct: number | null;
  margem_origem: 'escada' | 'manual' | 'derivada' | 'inviavel';
  margem_escada_pct: number;
  faixa_lote: string;
  preco_produto_sipi: number;
  preco_embalagem_sipi: number;
  preco_sipi: number;
  ipi_pct: number;
  base_ipi: 'total' | 'material' | 'nao_aplica';
  ipi_un: number;
  icms_sobre_ipi_un: number;
  preco_cipi: number;
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
  custo_total: number;
  tributos_por_dentro: number;
  ipi_por_fora: number;
  margem_brl: number;
  margem_sobre_preco_pct: number;
  margem_contribuicao: number;
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
  avaliada: boolean;
  minutos_excedentes_mes: number | null;
  horas_linha_extra_mes: number | null;
  horas_pessoa_extra_mes: number | null;
  custo_hora_pessoa: number | null;
  custo_mes: number | null;
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
  hora_extra: number | null;
  custo_fixo_incremental: number;
  depreciacao: number;
  custos_incrementais_fixos: number;
  lucro_operacional: number;
  margem_sobre_receita_pct: number | null;
  fluxo_caixa_operacional: number;
}

export interface PontoEquilibrio {
  custos_fixos_incrementais_mes: number;
  margem_contribuicao_un: number;
  unidades_mes: number | null;
  lotes_mes: number | null;
  producao_minima_lotes_mes: number | null;
  producao_minima_unidades_mes: number | null;
  com_absorcao: {
    margem_contribuicao_un: number;
    unidades_mes: number | null;
    lotes_mes: number | null;
  };
}

export interface PrecosMinimos {
  viavel: number | null;
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
    payback_meses: number | null;
    payback_dentro_do_horizonte: boolean | null;
  };
  ponto_equilibrio: PontoEquilibrio;
  precos_minimos: PrecosMinimos;
  alertas: AlertaViabilidade[];
  bloqueado: boolean;
  tributos: { fundamentos: string[] };
}

export interface LinhaEspelho {
  campo: string;
  rotulo: string;
  unidade: string;
  ideal: number | null;
  limite: number | null;
  diferenca: number | null;
}

export interface VigenciaUsada {
  chave: string;
  valor: number;
  vigencia_inicio: string;
  fonte: string;
}

export interface ResultadoViabilidade {
  engine: string;
  ideal: ResultadoCenario;
  limite: ResultadoCenario;
  espelho: LinhaEspelho[];
  premissas_usadas: string[];
  fundamentos: string[];
  vigencias_parametros: VigenciaUsada[];
  contexto: {
    producao: ParametrosProducaoViab;
    escada: EscadaMargemViab;
    lote_minimo_un: number;
  };
}

export interface ResumoCenario {
  preco_sipi: number;
  preco_cipi: number;
  margem_pct: number | null;
  lucro_mes: number;
  margem_sobre_receita_pct: number | null;
  bloqueado: boolean;
}
export interface ResumoViabilidade {
  ideal: ResumoCenario | null;
  limite: ResumoCenario | null;
}

// ------------------------------ API ------------------------------

export interface ParametrosProducaoViab {
  custo_fixo_producao_mensal: number;
  linhas_paralelas: number;
  eficiencia_producao: number;
  setup_minutos: number;
  dias_uteis_mes: number;
  horas_dia: number;
  moq_economico_valor?: number;
}
export interface EscadaMargemViab {
  lote_pequeno_pct: number;
  lote_medio_pct: number;
  lote_grande_pct: number;
  lote_medio_min_un: number;
  lote_grande_min_un: number;
}

export interface DefaultPremissa {
  campo: keyof PremissasCenario;
  valor: number | string | null;
  origem: string;
}

export interface NcmContexto extends NcmViab {
  id: number;
  descricao: string;
  provisorio: boolean;
}

export interface ClienteContexto {
  id: string;
  nome: string;
  regime_fiscal: RegimeFiscalCliente | null;
  finalidade_padrao: FinalidadeCliente | null;
  uf: string | null;
  contribuinte_icms: boolean | null;
}

export interface ContextoViabilidade {
  parametros: {
    producao: ParametrosProducaoViab;
    derivados: {
      capacidade_normal_min_mes: number;
      taxa_minuto: number;
      custo_setup_ordem: number;
      minutos_produtivos_dia_linha: number;
    };
    escada: EscadaMargemViab;
    lote_minimo_un: number;
    un_min_padrao: number | null;
    vigencias: VigenciaUsada[];
  } | null;
  erro: string | null;
  defaults: DefaultPremissa[];
  ncms: NcmContexto[];
  clientes: ClienteContexto[];
}

export interface ProjetoViabilidadeLista {
  id: number;
  nome: string;
  status: StatusProjetoViabilidade;
  cliente_id: string | null;
  cliente_nome: string | null;
  calculado_em: string | null;
  created_at: string;
  updated_at: string;
  resumo: ResumoViabilidade;
}

export interface ProjetoViabilidade {
  id: number;
  nome: string;
  status: StatusProjetoViabilidade;
  cliente_id: string | null;
  cliente: { id: string; nome: string } | null;
  observacoes: string | null;
  premissas: PremissasViabilidade;
  resultado: ResultadoViabilidade | null;
  calculado_em: string | null;
  created_at: string;
  updated_at: string;
  resumo: ResumoViabilidade;
}

export interface SalvarProjetoPayload {
  nome: string;
  cliente_id?: string | null;
  observacoes?: string | null;
  status?: StatusProjetoViabilidade;
  premissas: PremissasViabilidade;
}
