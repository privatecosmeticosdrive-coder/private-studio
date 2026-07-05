import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { FINALIDADES, REGIMES_FISCAIS } from './create-cliente.dto';

export class UpdateClienteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  // ---- perfil fiscal (F4 Fase A, D3) ----
  @IsOptional()
  @IsIn(REGIMES_FISCAIS as unknown as string[])
  regime_fiscal?: string;

  @IsOptional()
  @IsIn(FINALIDADES as unknown as string[])
  finalidade_padrao?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  uf?: string;

  @IsOptional()
  @IsBoolean()
  contribuinte_icms?: boolean;
}
