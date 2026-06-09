import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ComposicaoItemDto } from './composicao-item.dto';

export class NovaVersaoDto {
  @IsOptional()
  @IsString()
  versao_descricao?: string;

  // Composicao da nova versao. Se omitida, copia a da versao de origem.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComposicaoItemDto)
  composicao?: ComposicaoItemDto[];
}
