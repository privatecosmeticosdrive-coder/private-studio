import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Campos retornados ao cliente — NUNCA inclui password_hash.
const SELECT = {
  id: true,
  nome: true,
  email: true,
  role: true,
  ativo: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({ select: SELECT, orderBy: { created_at: 'asc' } });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SELECT });
    if (!user) throw new NotFoundException('Usuario nao encontrado');
    return user;
  }

  async create(dto: CreateUserDto) {
    const existe = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existe) throw new ConflictException('Email ja cadastrado');
    const password_hash = await bcrypt.hash(dto.senha, 10);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        nome: dto.nome,
        role: dto.role,
        password_hash,
      },
      select: SELECT,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id); // 404 se nao existir
    const data: Prisma.UserUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.senha !== undefined) data.password_hash = await bcrypt.hash(dto.senha, 10);
    return this.prisma.user.update({ where: { id }, data, select: SELECT });
  }

  /**
   * "Delete" = desativar (ativo=false). Preserva integridade referencial
   * (created_by em formulas/orcamentos/etc) e a trilha de auditoria.
   */
  async deactivate(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('Voce nao pode desativar o proprio usuario');
    }
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data: { ativo: false },
      select: SELECT,
    });
  }
}
