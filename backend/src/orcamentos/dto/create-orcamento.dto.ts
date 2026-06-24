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

  // Override de NCM do orcamento (F3). Opcional: se ausente, herda da formula
  // no consumo (ver resolverNcmEfetivo). NAO congela snapshot aqui.
  @IsOptional() @IsInt() @Min(1)
  ncm_id?: number;

  @IsOptional() @IsString()
  embalagem?: string;

  // Produtividade direta em un/min (Doc 2d §A) — usada na Fase 1.
  @IsOptional() @IsNumber() @Min(0.1) @Max(60)
  un_min?: number;

  // Embalagem do catalogo (Doc 2d §B).
  @IsOptional() @IsInt() @Min(1)
  embalagem_id?: number;

  @IsOptional() @IsBoolean()
  sem_embalagem?: boolean;

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
