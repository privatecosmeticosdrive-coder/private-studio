import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ComposicaoItemDto {
  @IsOptional()
  @IsString()
  fase?: string;

  @IsOptional()
  @IsInt()
  ordem?: number;

  @IsOptional()
  @IsInt()
  mp_id?: number;

  @IsOptional()
  @IsString()
  mp_nome_original?: string;

  @IsNumber()
  @Min(0)
  concentracao_pct!: number;

  @IsOptional()
  @IsString()
  funcao?: string;

  @IsOptional()
  @IsString()
  fornecedor_pref?: string;
}
