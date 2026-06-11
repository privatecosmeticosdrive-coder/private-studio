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

/**
 * Atualiza campos do briefing. NAO altera status (transicoes de status e
 * pipeline de amostragem tem endpoints proprios — Dia 7) nem o calculo travado.
 */
export class UpdateOrcamentoDto {
  @IsOptional() @IsString() @MinLength(2)
  produto?: string;

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

  // Produtividade direta em un/min (Doc 2d §A).
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

  @IsOptional() @IsBoolean()
  requer_amostra?: boolean;

  @IsOptional() @IsInt() @Min(1)
  amostra_qtd?: number;
}
