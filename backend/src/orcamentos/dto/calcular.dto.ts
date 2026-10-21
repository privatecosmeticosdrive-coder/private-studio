import { IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Inputs da Fase 1 (cálculo determinístico — Doc 2d). Sem IA: a produtividade
 * é informada diretamente em un/min e os demais custos vêm da fórmula/catálogo.
 * un_min é obrigatório aqui OU já gravado no orçamento (orcamento.un_min) OU,
 * no Motor 2, cai no `un_min_padrao` vigente COM ALERTA visível.
 */
export class CalcularDto {
  // Produtividade em unidades/minuto (presets 8/6/4/2/1 ou livre). Doc 2d §A2.
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(60)
  un_min?: number;

  // Margem MANUAL. No Motor 2, ausente => escada automática por lote
  // (registrada no snapshot como origem 'escada'); presente => override 'manual'.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99)
  margem_pct?: number;

  // Custo de MP base (R$/kg) quando NAO ha formula selecionada (senao vem da formula/budget).
  @IsOptional()
  @IsNumber()
  @Min(0)
  cmp_base_mp_kg?: number;

  // Seleção explícita do motor (1 = fiscal granular 3.1; 2 = Motor 2 10/26).
  // Ausente => parametro_producao.motor_precificacao vigente (ausente => 1).
  @IsOptional()
  @IsIn([1, 2])
  motor?: 1 | 2;
}
