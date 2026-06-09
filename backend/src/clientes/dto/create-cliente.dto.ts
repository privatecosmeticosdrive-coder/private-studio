import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateClienteDto {
  @IsString()
  @MinLength(2)
  nome!: string;

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
}
