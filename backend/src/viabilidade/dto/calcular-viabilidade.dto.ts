import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';
import { PremissasViabilidadeDto } from './premissas-viabilidade.dto';

/** POST /viabilidade/calcular — só calcula, não grava. */
export class CalcularViabilidadeDto {
  @IsObject()
  @ValidateNested()
  @Type(() => PremissasViabilidadeDto)
  premissas!: PremissasViabilidadeDto;
}
