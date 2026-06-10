import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCotacaoDto {
  @IsInt()
  mp_id!: number;

  @IsString()
  fornecedor!: string;

  @IsNumber() @Min(0)
  valor!: number;

  @IsOptional() @IsNumber() @Min(0)
  quantidade?: number;

  @IsOptional() @IsString()
  unidade?: string; // kg, L, un

  @IsOptional() @IsString()
  prazo_entrega?: string;

  @IsOptional() @IsDateString()
  validade_cotacao?: string;

  @IsOptional() @IsString()
  observacoes?: string;
}

export class RejeitarCotacaoDto {
  @IsOptional() @IsString()
  motivo?: string;
}
