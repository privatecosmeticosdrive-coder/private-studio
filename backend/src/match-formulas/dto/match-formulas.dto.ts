import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export const NIVEIS = ['basic', 'inter', 'premium'] as const;

/**
 * Briefing minimo para o match hibrido (Doc 2d §C4). Todos opcionais: sem
 * texto, o ranking cai para uso/recencia. categoria filtra; budget_mp limita
 * custo (tolerancia ×20).
 */
export class MatchFormulasDto {
  @IsOptional()
  @IsString()
  nome_projeto?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsIn(NIVEIS, { message: 'nivel invalido' })
  nivel?: (typeof NIVEIS)[number];

  @IsOptional()
  @IsString()
  briefing_tecnico?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budget_mp?: number;
}
