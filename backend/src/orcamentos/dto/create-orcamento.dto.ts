import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { OrcamentoNivel } from '@prisma/client';

export class CreateOrcamentoDto {
  @IsString()
  @MinLength(2)
  produto!: string;

  @IsOptional() @IsUUID()
  cliente_id?: string;

  @IsOptional() @IsString()
  categoria?: string;

  @IsOptional() @IsEnum(OrcamentoNivel)
  nivel?: OrcamentoNivel;

  @IsOptional() @IsNumber() @Min(0)
  volume_un?: number;

  @IsOptional() @IsInt() @Min(1)
  quantidade?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(99)
  margem_pct?: number;

  @IsOptional() @IsInt()
  formula_id?: number;

  @IsOptional() @IsString()
  embalagem?: string;

  @IsOptional() @IsNumber() @Min(0)
  budget_mp?: number;

  @IsOptional() @IsString()
  produto_referencia?: string;

  // Pipeline de amostragem (Doc 2c)
  @IsOptional() @IsBoolean()
  requer_amostra?: boolean;

  @IsOptional() @IsInt() @Min(1)
  amostra_qtd?: number;
}
