import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntrada {
  userId?: string | null;
  acao: string;
  entidade?: string;
  entidadeId?: string | number | null;
  detalhes?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra uma acao no audit_log. Aceita um client transacional (tx). */
  registrar(e: AuditEntrada, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.auditLog.create({
      data: {
        user_id: e.userId ?? null,
        acao: e.acao,
        entidade: e.entidade ?? null,
        entidade_id: e.entidadeId != null ? String(e.entidadeId) : null,
        detalhes: e.detalhes,
      },
    });
  }
}
