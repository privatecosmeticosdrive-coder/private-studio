import { IsOptional, IsString } from 'class-validator';

export class ValidarFormulaDto {
  @IsOptional()
  @IsString()
  validacao_obs?: string;
}
