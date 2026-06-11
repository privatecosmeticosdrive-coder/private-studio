import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export const TIPOS_EMBALAGEM = [
  'frasco',
  'pump',
  'tampa',
  'cartucho',
  'valvula',
  'celofane',
  'caixa',
  'rotulo',
  'outro',
] as const;

export class CreateEmbalagemDto {
  @IsOptional()
  @IsString()
  codigo?: string;

  @IsString()
  @MinLength(2)
  nome!: string;

  @IsIn(TIPOS_EMBALAGEM, { message: 'tipo de embalagem invalido' })
  tipo!: (typeof TIPOS_EMBALAGEM)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  volume_ml?: number;

  @IsOptional()
  @IsString()
  material?: string;

  @IsOptional()
  @IsString()
  cor?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  preco_un_brl?: number;

  @IsOptional()
  @IsString()
  fornecedor?: string;

  @IsOptional()
  @IsString()
  prazo_entrega?: string;

  // true quando o valor foi chutado (Doc 2d §B2). Se ausente, inferido de preco_un_brl.
  @IsOptional()
  @IsBoolean()
  preco_estimado?: boolean;

  @IsOptional()
  @IsDateString()
  data_cotacao?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
