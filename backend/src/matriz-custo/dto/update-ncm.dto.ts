import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

/** Edita uma linha de NCM (PATCH parcial). Validar uma linha = provisorio:false. */
export class UpdateNcmDto {
  @IsOptional() @IsString() @MinLength(2)
  ncm?: string;

  @IsOptional() @IsString() @MinLength(1)
  descricao?: string;

  @IsOptional() @IsNumber() @Min(0)
  ipi_pct?: number;

  @IsOptional() @IsBoolean()
  monofasico?: boolean;

  @IsOptional() @IsBoolean()
  provisorio?: boolean;

  @IsOptional() @IsBoolean()
  ativo?: boolean;
}
