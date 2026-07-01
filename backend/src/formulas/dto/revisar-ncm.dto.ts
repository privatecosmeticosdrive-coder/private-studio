import { IsInt, IsOptional, IsPositive } from 'class-validator';

/**
 * Revisão da associação fórmula->NCM (F5 Bloco C).
 * Se ncm_id vier, TROCA o NCM; se ausente, confirma o atual.
 * Em ambos os casos marca ncm_revisado=true + carimbo (ncm_revisado_em/por).
 */
export class RevisarNcmDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  ncm_id?: number;
}
