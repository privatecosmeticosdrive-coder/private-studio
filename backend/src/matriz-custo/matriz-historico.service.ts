import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface MatrizHistoricoEntrada {
  userId?: string | null;
  bloco: string; // operacional | fiscal | ncm
  entidade: string; // system_config | ncm
  entidadeId?: string | number | null;
  campo: string;
  valorAntes?: string | null;
  valorDepois?: string | null;
}

/**
 * Writer do log granular (antes->depois) em matriz_custo_historico.
 * Espelha o AuditService: aceita um client transacional (tx) para gravar na
 * MESMA transacao do update/insert. user_id = editor real (vem do @CurrentUser).
 */
@Injectable()
export class MatrizHistoricoService {
  constructor(private readonly prisma: PrismaService) {}

  registrar(entradas: MatrizHistoricoEntrada[], tx?: Prisma.TransactionClient) {
    if (entradas.length === 0) return Promise.resolve({ count: 0 });
    const client = tx ?? this.prisma;
    return client.matrizCustoHistorico.createMany({
      data: entradas.map((e) => ({
        user_id: e.userId ?? null,
        bloco: e.bloco,
        entidade: e.entidade,
        entidade_id: e.entidadeId != null ? String(e.entidadeId) : null,
        campo: e.campo,
        valor_antes: e.valorAntes ?? null,
        valor_depois: e.valorDepois ?? null,
      })),
    });
  }
}
