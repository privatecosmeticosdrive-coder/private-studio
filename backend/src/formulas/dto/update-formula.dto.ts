import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ComposicaoItemDto } from './composicao-item.dto';

export class UpdateFormulaDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome_produto?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsString()
  versao_descricao?: string;

  // Se enviado, SUBSTITUI a composicao inteira (replace).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComposicaoItemDto)
  composicao?: ComposicaoItemDto[];
}
