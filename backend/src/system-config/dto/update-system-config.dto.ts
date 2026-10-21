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

  // ---- LEGADO (NAO alimentam o preco desde o corte F3/F4 e o Motor 2 10/26) ----
  // mo_folha_mensal/mo_dias_uteis/mo_colaboradores/imposto_mp_pct/imposto_mo_pct/
  // ipi_pct ficam aceitos so por compatibilidade de API; a tela Admin nao os
  // edita mais. MO vem de parametro_producao; tributos da matriz fiscal; IPI do NCM.
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

  // ---- VIVOS: perda de MP e frete/un (lidos pelo Motor 1 e pelo Motor 2) ----
  @IsOptional() @IsNumber() @Min(0)
  desvio_mp_pct?: number;

  @IsOptional() @IsNumber() @Min(0)
  frete_un_brl?: number;
}
