import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { TIPOS_EMBALAGEM } from './create-embalagem.dto';

/**
 * Atualizacao cadastral da embalagem. NAO inclui preco — toda mudanca de preco
 * passa por POST /embalagens/:id/atualizar-preco (gera historico).
 */
export class UpdateEmbalagemDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsIn(TIPOS_EMBALAGEM, { message: 'tipo de embalagem invalido' })
  tipo?: (typeof TIPOS_EMBALAGEM)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  volume_ml?: number;

  @IsOptional()
  @IsString()
  material?: string;

  @IsOptional()
  @IsString()
  cor?: string;

  @IsOptional()
  @IsString()
  fornecedor?: string;

  @IsOptional()
  @IsString()
  prazo_entrega?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
