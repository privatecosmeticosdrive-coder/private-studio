import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { FONTES_INFO } from '../../materias-primas/dto/atualizar-preco.dto';

export class AtualizarPrecoEmbDto {
  @IsNumber()
  @Min(0)
  preco_un_brl!: number;

  @IsOptional()
  @IsString()
  fornecedor?: string;

  @IsDateString()
  data_cotacao!: string;

  @IsOptional()
  @IsIn(FONTES_INFO, { message: 'fonte_info invalida' })
  fonte_info?: (typeof FONTES_INFO)[number];

  @IsOptional()
  @IsString()
  observacoes?: string;
}
