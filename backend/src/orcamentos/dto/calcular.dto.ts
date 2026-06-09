import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Overrides opcionais para a Fase 1 (cálculo). Quando ausentes, o sistema
 * estima a partir da formula/briefing (heuristica no MOCK, IA no modo real).
 */
export class CalcularDto {
  @IsOptional() @IsInt() @Min(2) @Max(20)
  etapas?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(99)
  margem_pct?: number;

  @IsOptional() @IsNumber() @Min(0)
  embalagem_un?: number;

  @IsOptional() @IsNumber() @Min(0)
  mp_frag_kg?: number;

  // Forca um custo de MP base (R$/kg) quando nao ha formula selecionada
  @IsOptional() @IsNumber() @Min(0)
  cmp_base_mp_kg?: number;
}
