import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Senha deve ter ao menos 6 caracteres' })
  senha?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Role invalido' })
  role?: Role;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
