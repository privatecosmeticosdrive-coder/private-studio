import {
  IsBoolean,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

/**
 * Parametros editaveis pelo admin (Doc 2 §11 + Doc 2b §B6).
 * Todos opcionais — atualiza so o que vier no body.
 */
export class UpdateSystemConfigDto {
  // alertas de preco
  @IsOptional() @IsNumber() @Min(0)
  alerta_aumento_mp_pct?: number;

  @IsOptional() @IsBoolean()
  alertas_ativos?: boolean;

  // parametros do modelo de custo
  @IsOptional() @IsNumber() @Min(0)
  mo_folha_mensal?: number;

  @IsOptional() @IsNumber() @Min(1)
  mo_dias_uteis?: number;

  @IsOptional() @IsNumber() @Min(1)
  mo_colaboradores?: number;

  @IsOptional() @IsNumber() @Min(0)
  imposto_mp_pct?: number;

  @IsOptional() @IsNumber() @Min(0)
  imposto_mo_pct?: number;

  @IsOptional() @IsNumber() @Min(0)
  ipi_pct?: number;

  @IsOptional() @IsNumber() @Min(0)
  desvio_mp_pct?: number;

  @IsOptional() @IsNumber() @Min(0)
  frete_un_brl?: number;
}
