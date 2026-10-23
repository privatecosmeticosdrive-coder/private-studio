import { Type } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PremissasViabilidadeDto } from './premissas-viabilidade.dto';

export const STATUS_PROJETO_VIABILIDADE = [
  'rascunho',
  'analisado',
  'aprovado',
  'descartado',
] as const;
export type StatusProjetoViabilidade = (typeof STATUS_PROJETO_VIABILIDADE)[number];

/** POST /viabilidade — cria o projeto e já calcula. */
export class CreateProjetoViabilidadeDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsUUID()
  cliente_id?: string | null;

  @IsOptional()
  @IsString()
  observacoes?: string | null;

  @IsOptional()
  @IsIn(STATUS_PROJETO_VIABILIDADE as unknown as string[])
  status?: StatusProjetoViabilidade;

  @IsObject()
  @ValidateNested()
  @Type(() => PremissasViabilidadeDto)
  premissas!: PremissasViabilidadeDto;
}
