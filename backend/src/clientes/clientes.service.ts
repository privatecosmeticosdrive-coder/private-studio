import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(q?: string) {
    return this.prisma.cliente.findMany({
      where: q ? { nome: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { nome: 'asc' },
    });
  }

  async findOne(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        orcamentos: {
          select: { id: true, numero: true, produto: true, status: true, created_at: true },
          orderBy: { created_at: 'desc' },
        },
      },
    });
    if (!cliente) throw new NotFoundException('Cliente nao encontrado');
    return cliente;
  }

  create(dto: CreateClienteDto, userId: string) {
    return this.prisma.cliente.create({
      data: { ...dto, created_by: userId },
    });
  }

  async update(id: string, dto: UpdateClienteDto) {
    await this.ensure(id);
    return this.prisma.cliente.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.ensure(id);
    const [orcs, forms] = await Promise.all([
      this.prisma.orcamento.count({ where: { cliente_id: id } }),
      this.prisma.formula.count({ where: { cliente_id: id } }),
    ]);
    if (orcs > 0 || forms > 0) {
      throw new ConflictException(
        `Cliente possui ${orcs} orcamento(s) e ${forms} formula(s) vinculados — nao pode ser excluido.`,
      );
    }
    return this.prisma.cliente.delete({ where: { id } });
  }

  private async ensure(id: string) {
    const exists = await this.prisma.cliente.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Cliente nao encontrado');
  }
}
