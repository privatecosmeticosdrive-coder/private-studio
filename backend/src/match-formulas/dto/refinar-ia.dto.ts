import { IsInt, Min } from 'class-validator';

export class RefinarIaDto {
  // id do FormulaMatch retornado por POST /orcamentos/match-formulas
  @IsInt()
  @Min(1)
  match_id!: number;
}
