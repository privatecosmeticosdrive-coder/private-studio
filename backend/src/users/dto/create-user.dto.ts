import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email invalido' })
  email!: string;

  @IsString()
  @MinLength(2, { message: 'Nome muito curto' })
  nome!: string;

  @IsString()
  @MinLength(6, { message: 'Senha deve ter ao menos 6 caracteres' })
  senha!: string;

  @IsEnum(Role, { message: 'Role invalido (admin|comercial|pd|compras|producao)' })
  role!: Role;
}
