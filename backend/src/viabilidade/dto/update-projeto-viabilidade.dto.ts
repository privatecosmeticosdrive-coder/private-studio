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
import {
  STATUS_PROJETO_VIABILIDADE,
  type StatusProjetoViabilidade,
} from './create-projeto-viabilidade.dto';

/** PATCH /viabilidade/:id — atualiza premissas/nome/status/observações e recalcula. */
export class UpdateProjetoViabilidadeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsUUID()
  cliente_id?: string | null;

  @IsOptional()
  @IsString()
  observacoes?: string | null;

  @IsOptional()
  @IsIn(STATUS_PROJETO_VIABILIDADE as unknown as string[])
  status?: StatusProjetoViabilidade;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PremissasViabilidadeDto)
  premissas?: PremissasViabilidadeDto;
}
