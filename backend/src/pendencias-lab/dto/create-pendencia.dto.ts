import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const TIPOS_PENDENCIA = ['formulacao_nova', 'revisao'] as const;
export const URGENCIAS = ['mesmo_dia', 'dois_tres_dias', 'ate_sete_dias'] as const;

/**
 * Solicitação ao laboratório (Jornada de Laboratório, fatia 1).
 * D6: ncm_proposto_id é OBRIGATÓRIO para formulacao_nova (a fórmula nova nasce
 * com ele); em revisao é opcional (herda da fórmula-base).
 */
export class CreatePendenciaDto {
  @IsIn(TIPOS_PENDENCIA as unknown as string[])
  tipo!: string;

  @IsIn(URGENCIAS as unknown as string[])
  urgencia!: string;

  @IsString()
  @MinLength(3)
  descricao!: string;

  // D6 — obrigatório quando formulacao_nova; validado condicionalmente.
  @ValidateIf((o) => o.tipo === 'formulacao_nova')
  @IsInt()
  @Min(1)
  ncm_proposto_id?: number;

  @IsOptional() @IsUUID()
  orcamento_id?: string;

  @IsOptional() @IsInt() @Min(1)
  formula_base_id?: number;

  @IsOptional() @IsString()
  motivo_origem?: string;
}
