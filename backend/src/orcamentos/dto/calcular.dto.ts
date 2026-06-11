import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Inputs da Fase 1 (cálculo determinístico — Doc 2d). Sem IA: a produtividade
 * é informada diretamente em un/min e os demais custos vêm da fórmula/catálogo.
 * un_min é obrigatório aqui OU já gravado no orçamento (orcamento.un_min).
 */
export class CalcularDto {
  // Produtividade em unidades/minuto (presets 8/6/4/2/1 ou livre). Doc 2d §A2.
  @IsOptional() @IsNumber() @Min(0.1) @Max(60)
  un_min?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(99)
  margem_pct?: number;

  // Custo de MP base (R$/kg) quando NAO ha formula selecionada (senao vem da formula/budget).
  @IsOptional() @IsNumber() @Min(0)
  cmp_base_mp_kg?: number;
}
