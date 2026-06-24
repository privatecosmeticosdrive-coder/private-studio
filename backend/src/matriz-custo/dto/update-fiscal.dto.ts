import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Bloco fiscal da Matriz (editavel). PATCH parcial.
 * fiscais_provisorios pode ser setado false aqui (capacidade); a UX de
 * confirmacao "tudo validado pelo contador" fica na F5.
 */
export class UpdateFiscalDto {
  @IsOptional() @IsNumber() @Min(0)
  icms_regime?: number;

  @IsOptional() @IsBoolean()
  encomendante_simples?: boolean;

  @IsOptional() @IsNumber() @Min(0)
  pis_cofins_monofasico_pct?: number;

  @IsOptional() @IsNumber() @Min(0)
  pis_cofins_servico_pct?: number;

  @IsOptional() @IsBoolean()
  fiscais_provisorios?: boolean;
}
