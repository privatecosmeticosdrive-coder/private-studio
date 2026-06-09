import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ComposicaoItemDto } from './composicao-item.dto';

export class CreateFormulaDto {
  @IsString()
  @MinLength(2)
  nome_produto!: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @IsOptional()
  @IsString()
  versao_descricao?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComposicaoItemDto)
  composicao!: ComposicaoItemDto[];
}
