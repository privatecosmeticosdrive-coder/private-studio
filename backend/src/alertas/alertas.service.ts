import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AlertaAumentoParams {
  mpNome: string;
  precoAntigo: number;
  precoNovo: number;
  variacaoPct: number;
  nFormulas: number;
  mpId: number;
}

@Injectable()
export class AlertasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria um alerta de aumento relevante de MP (usado pelo atualizar-preco). */
  gerarAlertaAumento(p: AlertaAumentoParams, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const titulo = `${p.mpNome} subiu ${p.variacaoPct.toFixed(1)}%`;
    const mensagem =
      `${p.mpNome} subiu ${p.variacaoPct.toFixed(1)}% ` +
      `(R$${p.precoAntigo.toFixed(2)} → R$${p.precoNovo.toFixed(2)}). ` +
      `Esta MP esta em ${p.nFormulas} formulas.`;
    return client.alerta.create({
      data: {
        tipo: 'aumento_mp',
        titulo,
        mensagem,
        entidade_tipo: 'mp',
        entidade_id: p.mpId,
        severidade: p.variacaoPct >= 50 ? 'critical' : 'warn',
        created_for: ['comercial', 'pd', 'admin'],
      },
    });
  }

  /** Lista alertas. lido/resolvido sao calculados/filtrados para o usuario atual. */
  async findAll(userId: string, opts: { lido?: boolean; resolvido?: boolean }) {
    const where: Prisma.AlertaWhereInput = {};
    if (opts.resolvido !== undefined) where.resolvido = opts.resolvido;

    const alertas = await this.prisma.alerta.findMany({
      where,
      orderBy: [{ resolvido: 'asc' }, { created_at: 'desc' }],
    });

    const comFlag = alertas.map((a) => {
      const lidoPor = Array.isArray(a.lido_por) ? (a.lido_por as string[]) : [];
      return { ...a, lido: lidoPor.includes(userId) };
    });

    if (opts.lido === undefined) return comFlag;
    return comFlag.filter((a) => a.lido === opts.lido);
  }

  async marcarLido(id: number, userId: string) {
    const alerta = await this.prisma.alerta.findUnique({ where: { id } });
    if (!alerta) throw new NotFoundException('Alerta nao encontrado');
    const lidoPor = Array.isArray(alerta.lido_por) ? (alerta.lido_por as string[]) : [];
    if (!lidoPor.includes(userId)) lidoPor.push(userId);
    return this.prisma.alerta.update({
      where: { id },
      data: { lido_por: lidoPor },
    });
  }

  async resolver(id: number) {
    const alerta = await this.prisma.alerta.findUnique({ where: { id } });
    if (!alerta) throw new NotFoundException('Alerta nao encontrado');
    return this.prisma.alerta.update({
      where: { id },
      data: { resolvido: true },
    });
  }
}
