import { IsIn, IsInt, IsString, Min, MinLength } from 'class-validator';
import { URGENCIAS } from './create-pendencia.dto';

/** Melhoria proativa (gatilho c): revisão de uma fórmula validada, sem NCM
 *  (herda da base) e sem orçamento de origem. */
export class RevisaoProativaDto {
  @IsInt()
  @Min(1)
  formula_base_id!: number;

  @IsIn(URGENCIAS as unknown as string[])
  urgencia!: string;

  @IsString()
  @MinLength(3)
  descricao!: string;
}
