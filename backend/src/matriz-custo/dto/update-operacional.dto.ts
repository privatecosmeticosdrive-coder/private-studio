import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Bloco operacional da Matriz (editavel). Campos opcionais: PATCH parcial. */
export class UpdateOperacionalDto {
  @IsOptional() @IsNumber() @Min(0)
  custo_fixo_mensal?: number;

  @IsOptional() @IsInt() @Min(1) @Max(31)
  mo_dias_uteis?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(24)
  horas_dia?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  eficiencia_linha?: number;

  @IsOptional() @IsNumber() @Min(0)
  desvio_mp_pct?: number;

  @IsOptional() @IsNumber() @Min(0)
  frete_un_brl?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(99)
  margem_padrao_pct?: number;
}
