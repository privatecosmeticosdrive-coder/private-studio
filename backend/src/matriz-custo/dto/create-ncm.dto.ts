import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

/** Cria uma linha de NCM. Nasce provisorio=true / ativo=true por padrao. */
export class CreateNcmDto {
  @IsString() @MinLength(2)
  ncm!: string;

  @IsString() @MinLength(1)
  descricao!: string;

  @IsNumber() @Min(0)
  ipi_pct!: number;

  @IsBoolean()
  monofasico!: boolean;

  @IsOptional() @IsBoolean()
  provisorio?: boolean;

  @IsOptional() @IsBoolean()
  ativo?: boolean;
}
