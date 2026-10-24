import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FAC_MAX_ITENS } from '../fac.util';

/** Um item do ajuste do comercial (FAC). Limites finos (5 pontos) em fac.util. */
export class ItemAjusteFacDto {
  @IsInt()
  mp_id!: number;

  @IsIn(['alterar', 'adicionar', 'remover'])
  acao!: 'alterar' | 'adicionar' | 'remover';

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  para_pct?: number;
}

export class AjusteFacDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FAC_MAX_ITENS)
  @ValidateNested({ each: true })
  @Type(() => ItemAjusteFacDto)
  itens!: ItemAjusteFacDto[];
}

export class ExcluirOrcamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
