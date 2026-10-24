import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CondicoesPropostaDto {
  @IsOptional() @IsString() @MaxLength(500) pedido_minimo?: string;
  @IsOptional() @IsString() @MaxLength(1000) prazo_entrega?: string;
  @IsOptional() @IsString() @MaxLength(500) forma_pagamento?: string;
  @IsOptional() @IsInt() @Min(1) validade_dias?: number;
  @IsOptional() @IsString() @MaxLength(100) frete?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) reajustes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) consideracoes?: string[];
  @IsOptional() @IsString() @MaxLength(1500) amostras?: string;
  @IsOptional() @IsString() @MaxLength(100) local?: string;
}

export class CreatePropostaDto {
  @IsUUID()
  cliente_id!: string;

  /** Orcamentos selecionados, na ordem em que saem na proposta. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsUUID('all', { each: true })
  orcamento_ids!: string[];

  @IsOptional()
  @IsObject()
  @Type(() => CondicoesPropostaDto)
  condicoes?: CondicoesPropostaDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class AssinarPropostaDto {
  @IsString()
  @MaxLength(200)
  assinada_por_nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  assinada_por_documento?: string;

  /** Data da assinatura (default: agora). */
  @IsOptional()
  @IsDateString()
  assinada_em?: string;
}

export class CancelarPropostaDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
