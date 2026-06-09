import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Atualizacao cadastral da MP. NAO inclui preco — toda mudanca de preco
 * passa por POST /mps/:codigo/atualizar-preco (gera historico + alerta).
 */
export class UpdateMpDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsString()
  fornecedor?: string;

  @IsOptional()
  @IsString()
  embalagem_minima?: string;

  @IsOptional()
  @IsString()
  validade_cotacao?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsBoolean()
  validado_pd?: boolean;

  @IsOptional()
  @IsBoolean()
  validado_compras?: boolean;
}
