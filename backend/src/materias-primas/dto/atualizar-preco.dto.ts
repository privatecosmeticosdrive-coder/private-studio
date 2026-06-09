import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const FONTES_INFO = [
  'ligacao',
  'email',
  'whatsapp',
  'pedido_formal',
  'painel_fornecedor',
  'ultima_compra',
  'outro',
] as const;

export class AtualizarPrecoDto {
  @IsNumber()
  @Min(0)
  preco_kg_brl!: number;

  @IsString()
  fornecedor!: string;

  @IsDateString()
  data_cotacao!: string;

  @IsIn(FONTES_INFO, { message: 'fonte_info invalida' })
  fonte_info!: (typeof FONTES_INFO)[number];

  @IsOptional()
  @IsString()
  observacoes?: string;
}
