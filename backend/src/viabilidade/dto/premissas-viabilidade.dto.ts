import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { REGIMES_FISCAIS, FINALIDADES } from '../../clientes/dto/create-cliente.dto';

/**
 * Premissas da análise de viabilidade (espelham `PremissasCenario` do engine).
 * O cenário IDEAL é completo e obrigatório; o LIMITE é parcial (herda do ideal).
 * A validação de NEGÓCIO (obrigatórios, faixas, coerência) é do engine (regra 6:
 * erro listando o que falta) — aqui só o formato. `whitelist: true` do
 * ValidationPipe descarta campos desconhecidos, por isso cada campo tem decorator.
 */

export const MODOS_OPERACAO_DTO = ['full_service', 'hibrido', 'industrializacao'] as const;
export const TRATAMENTOS_IPI_DTO = [
  'tributado',
  'aliquota_zero',
  'suspenso',
  'isento',
  'nao_tributado',
] as const;

export class PerfilFiscalDto {
  @IsOptional()
  @IsIn(REGIMES_FISCAIS as unknown as string[])
  regime_fiscal?: string | null;

  @IsOptional()
  @IsIn(FINALIDADES as unknown as string[])
  finalidade?: string | null;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  uf?: string | null;

  @IsOptional()
  @IsBoolean()
  contribuinte_icms?: boolean | null;
}

export class NcmPremissaDto {
  @IsString()
  @MinLength(4)
  ncm!: string;

  @IsOptional()
  @IsString()
  ex_tipi?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  ipi_pct!: number;

  @IsBoolean()
  monofasico!: boolean;

  @IsIn(TRATAMENTOS_IPI_DTO as unknown as string[])
  tratamento!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  icms_nominal_pct?: number | null;
}

export class CenarioIdealDto {
  @IsString()
  @MinLength(1)
  produto!: string;

  @IsNumber() @Min(0) volume_un!: number;
  @IsNumber() @Min(0) quantidade!: number;
  @IsNumber() @Min(0) lotes_por_mes!: number;
  @IsNumber() @Min(0) un_min!: number;
  @IsNumber() @Min(0) cmp_base_mp_kg!: number;
  @IsNumber() @Min(0) perda_mp_pct!: number;
  @IsNumber() @Min(0) @Max(100) credito_mp_pct!: number;
  @IsNumber() @Min(0) @Max(100) credito_emb_pct!: number;
  @IsNumber() @Min(0) embalagem_un!: number;
  @IsNumber() @Min(0) taxa_gestao_embalagem_pct!: number;
  @IsNumber() @Min(0) frete_un_brl!: number;

  @IsIn(MODOS_OPERACAO_DTO as unknown as string[])
  modo_operacao!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PerfilFiscalDto)
  perfil_fiscal!: PerfilFiscalDto;

  @IsObject()
  @ValidateNested()
  @Type(() => NcmPremissaDto)
  ncm!: NcmPremissaDto;

  @IsOptional() @IsNumber() @Min(0) @Max(99) margem_pct?: number | null;
  @IsOptional() @IsNumber() @Min(0) preco_venda_un?: number | null;

  @IsNumber() @Min(0) investimento_brl!: number;
  @IsNumber() @Min(0) investimento_meses_depreciacao!: number;
  @IsNumber() @Min(0) custo_fixo_incremental_mes!: number;
  @IsNumber() @Min(0) horizonte_meses!: number;
  @IsNumber() @Min(0) @Max(100) margem_minima_aceitavel_pct!: number;
  @IsNumber() @Min(0) pessoas_por_linha!: number;

  @IsOptional() @IsNumber() @Min(0) ocupacao_atual_pct?: number | null;
  @IsOptional() @IsNumber() @Min(0) custo_hora_extra_hora?: number | null;
  @IsOptional() @IsNumber() @Min(0) horas_extra_maximas_mes?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mp_sem_preco?: string[];
}

/** Cenário LIMITE: tudo opcional — undefined herda do ideal. */
export class CenarioLimiteDto {
  @IsOptional() @IsString() @MinLength(1) produto?: string;
  @IsOptional() @IsNumber() @Min(0) volume_un?: number;
  @IsOptional() @IsNumber() @Min(0) quantidade?: number;
  @IsOptional() @IsNumber() @Min(0) lotes_por_mes?: number;
  @IsOptional() @IsNumber() @Min(0) un_min?: number;
  @IsOptional() @IsNumber() @Min(0) cmp_base_mp_kg?: number;
  @IsOptional() @IsNumber() @Min(0) perda_mp_pct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) credito_mp_pct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) credito_emb_pct?: number;
  @IsOptional() @IsNumber() @Min(0) embalagem_un?: number;
  @IsOptional() @IsNumber() @Min(0) taxa_gestao_embalagem_pct?: number;
  @IsOptional() @IsNumber() @Min(0) frete_un_brl?: number;

  @IsOptional()
  @IsIn(MODOS_OPERACAO_DTO as unknown as string[])
  modo_operacao?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PerfilFiscalDto)
  perfil_fiscal?: PerfilFiscalDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NcmPremissaDto)
  ncm?: NcmPremissaDto;

  @IsOptional() @IsNumber() @Min(0) @Max(99) margem_pct?: number | null;
  @IsOptional() @IsNumber() @Min(0) preco_venda_un?: number | null;
  @IsOptional() @IsNumber() @Min(0) investimento_brl?: number;
  @IsOptional() @IsNumber() @Min(0) investimento_meses_depreciacao?: number;
  @IsOptional() @IsNumber() @Min(0) custo_fixo_incremental_mes?: number;
  @IsOptional() @IsNumber() @Min(0) horizonte_meses?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) margem_minima_aceitavel_pct?: number;
  @IsOptional() @IsNumber() @Min(0) pessoas_por_linha?: number;
  @IsOptional() @IsNumber() @Min(0) ocupacao_atual_pct?: number | null;
  @IsOptional() @IsNumber() @Min(0) custo_hora_extra_hora?: number | null;
  @IsOptional() @IsNumber() @Min(0) horas_extra_maximas_mes?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mp_sem_preco?: string[];
}

export class PremissasViabilidadeDto {
  @IsObject()
  @ValidateNested()
  @Type(() => CenarioIdealDto)
  ideal!: CenarioIdealDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CenarioLimiteDto)
  limite?: CenarioLimiteDto | null;
}
