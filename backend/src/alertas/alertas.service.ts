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

  /**
   * FAC (10/26): avisa o laboratorio de que o comercial ajustou a formula no
   * orcamento (ou que o ajuste foi aprovado pelo cliente / removido). So controle:
   * nada e bloqueado; quando aprovado, o lab ja sabe o que mudou.
   */
  gerarAlertaFac(
    p: {
      numero: number;
      produto: string;
      cliente: string | null;
      evento: 'ajustado' | 'aprovado' | 'removido';
      itens: { nome: string; acao: string; de_pct: number; para_pct: number }[];
      compensacao: { nome: string; de_pct: number; para_pct: number } | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const quem = p.cliente ? ` (${p.cliente})` : '';
    const titulo =
      p.evento === 'aprovado'
        ? `FAC aprovada pelo cliente — orçamento #${p.numero} ${p.produto}${quem}`
        : p.evento === 'removido'
          ? `FAC removida — orçamento #${p.numero} ${p.produto}${quem}`
          : `Fórmula ajustada pelo comercial (FAC) — orçamento #${p.numero} ${p.produto}${quem}`;
    const linhas = p.itens.map((i) =>
      i.acao === 'adicionar'
        ? `+ ${i.nome}: ${i.para_pct}%`
        : i.acao === 'remover'
          ? `− ${i.nome}: ${i.de_pct}% → removida`
          : `${i.nome}: ${i.de_pct}% → ${i.para_pct}%`,
    );
    if (p.compensacao) {
      linhas.push(`(compensado em ${p.compensacao.nome}: ${p.compensacao.de_pct}% → ${p.compensacao.para_pct}%)`);
    }
    return client.alerta.create({
      data: {
        tipo: 'ajuste_fac',
        titulo,
        mensagem:
          p.evento === 'removido' ? 'O orçamento voltou para a fórmula original do laboratório.' : linhas.join('\n'),
        entidade_tipo: 'orcamento',
        entidade_id: p.numero,
        severidade: p.evento === 'aprovado' ? 'warn' : 'info',
        created_for: ['pd', 'admin'],
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
