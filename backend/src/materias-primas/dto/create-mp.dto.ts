import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMpDto {
  @IsInt()
  @Min(0)
  codigo!: number;

  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  preco_kg_brl?: number;

  @IsOptional()
  @IsString()
  fornecedor?: string;

  @IsOptional()
  @IsString()
  embalagem_minima?: string;

  @IsOptional()
  @IsDateString()
  data_cotacao?: string;

  @IsOptional()
  @IsString()
  validade_cotacao?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
