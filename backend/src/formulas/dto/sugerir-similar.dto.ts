import { IsOptional, IsString } from 'class-validator';

export class SugerirSimilarDto {
  @IsOptional()
  @IsString()
  nome_produto?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  texto?: string;
}
