import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Chaves de parametro_producao lidas pelo código (modelo de MO de 3 componentes
 * + política comercial do Motor 2 10/26). Nova chave exige código que a leia.
 */
export const CHAVES_PARAMETRO_PRODUCAO = [
  // fábrica (custo-producao.util / params-producao.util)
  'custo_fixo_producao_mensal',
  'linhas_paralelas',
  'eficiencia_producao',
  'setup_minutos',
  'dias_uteis_mes',
  'horas_dia',
  'moq_economico_valor',
  // Motor 2 10/26 — política (params-motor2.util)
  'motor_precificacao',
  'taxa_gestao_embalagem_pct',
  'margem_lote_pequeno_pct',
  'margem_lote_medio_pct',
  'margem_lote_grande_pct',
  'lote_medio_min_un',
  'lote_grande_min_un',
  'lote_minimo_un',
  'un_min_padrao',
  // Analise de viabilidade (10/26) - opcionais, usados como default das premissas
  'custo_hora_extra_hora',
  'pessoas_por_linha',
] as const;

export class CreateParametroProducaoDto {
  @IsIn(CHAVES_PARAMETRO_PRODUCAO)
  chave!: string;

  @IsNumber()
  @Min(0)
  valor!: number;

  @IsISO8601()
  vigencia_inicio!: string; // inicio da NOVA vigencia (a anterior e encerrada no dia anterior)

  @IsString()
  @MinLength(10)
  fonte!: string; // origem do numero (levantamento, extrato, medicao, politica) + status medido/provisorio
}
