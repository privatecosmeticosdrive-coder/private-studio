import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AprovarClienteDto,
  FeedbackAmostraDto,
  ObsAmostraDto,
  RejeitarClienteDto,
  SolicitarAmostraDto,
} from './dto/amostra.dto';

const ORDEM_PIPELINE = [
  'solicitada',
  'em_producao',
  'pronta',
  'enviada',
  'aprovada_cliente',
  'rejeitada',
] as const;

@Injectable()
export class AmostrasService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- transicoes do pipeline ----------------

  async solicitar(id: string, dto: SolicitarAmostraDto, userId: string) {
    const orc = await this.buscar(id);
    if (orc.status !== 'aprovado_cliente') {
      throw new BadRequestException(
        `Só é possível solicitar amostra apos aprovacao do cliente (status atual: '${orc.status}').`,
      );
    }
    if (!orc.requer_amostra) {
      throw new BadRequestException('Este orcamento esta marcado como requer_amostra=false.');
    }
    if (orc.amostra_status !== 'nao_solicitada') {
      throw new BadRequestException(`Amostra ja esta em '${orc.amostra_status}'.`);
    }
    const agora = new Date();
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.orcamento.update({
        where: { id },
        data: {
          amostra_status: 'solicitada',
          amostra_solicitada_em: agora,
          amostra_solicitada_por: userId,
          amostra_qtd: dto.qtd ?? orc.amostra_qtd ?? 5,
          amostra_observacoes_lab: dto.observacoes ?? orc.amostra_observacoes_lab,
          status: 'em_amostragem',
        },
      });
      await this.evento(tx, id, orc.amostra_status, 'solicitada', dto.observacoes, userId);
      await this.integration(tx, 'amostra_solicitada', orc, {
        qtd_amostras: upd.amostra_qtd,
        observacoes: dto.observacoes,
        responsavel_solicitacao: userId,
        data_limite_sugerida: this.addDias(agora, 5).toISOString(),
      });
      return upd;
    });
  }

  async iniciar(id: string, dto: ObsAmostraDto, userId: string) {
    const orc = await this.exigirStatus(id, 'solicitada');
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.orcamento.update({
        where: { id },
        data: {
          amostra_status: 'em_producao',
          amostra_responsavel_id: userId,
          amostra_producao_iniciada_em: new Date(),
          amostra_observacoes_lab: dto.observacoes ?? orc.amostra_observacoes_lab,
        },
      });
      await this.evento(tx, id, 'solicitada', 'em_producao', dto.observacoes, userId);
      return upd;
    });
  }

  async pronta(id: string, dto: ObsAmostraDto, userId: string) {
    const orc = await this.exigirStatus(id, 'em_producao');
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.orcamento.update({
        where: { id },
        data: { amostra_status: 'pronta', amostra_pronta_em: new Date() },
      });
      await this.evento(tx, id, 'em_producao', 'pronta', dto.observacoes, userId);
      await this.integration(tx, 'amostra_pronta', orc, { observacoes: dto.observacoes });
      return upd;
    });
  }

  async enviar(id: string, dto: ObsAmostraDto, userId: string) {
    const orc = await this.exigirStatus(id, 'pronta');
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.orcamento.update({
        where: { id },
        data: { amostra_status: 'enviada', amostra_enviada_em: new Date() },
      });
      await this.evento(tx, id, 'pronta', 'enviada', dto.observacoes, userId);
      await this.integration(tx, 'amostra_enviada', orc, { observacoes: dto.observacoes });
      return upd;
    });
  }

  async feedback(id: string, dto: FeedbackAmostraDto, userId: string) {
    await this.exigirStatus(id, 'enviada');
    const novo = dto.aprovada ? 'aprovada_cliente' : 'rejeitada';
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.orcamento.update({
        where: { id },
        data: {
          amostra_status: novo,
          amostra_retorno_em: new Date(),
          amostra_feedback_cliente: dto.feedback,
        },
      });
      await this.evento(tx, id, 'enviada', novo, dto.feedback, userId);
      return upd;
    });
  }

  // ---------------- aprovacao/rejeicao do cliente (separado) ----------------

  async marcarAprovadoCliente(id: string, dto: AprovarClienteDto, userId: string) {
    const orc = await this.buscar(id);
    const upd = await this.prisma.$transaction(async (tx) => {
      const u = await tx.orcamento.update({
        where: { id },
        data: { status: 'aprovado_cliente' },
      });
      await this.integration(tx, 'orcamento_aprovado_cliente', orc, {
        observacoes: dto.observacoes,
        aprovado_por: userId,
      });
      return u;
    });
    return {
      orcamento: upd,
      proximo_passo: orc.requer_amostra
        ? 'Proximo passo: solicitar amostra ao laboratorio.'
        : 'Pronto para producao (nao requer amostra).',
    };
  }

  async marcarRejeitadoCliente(id: string, dto: RejeitarClienteDto, userId: string) {
    const orc = await this.buscar(id);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.orcamento.update({ where: { id }, data: { status: 'rejeitado' } });
      await this.integration(tx, 'orcamento_rejeitado_cliente', orc, {
        motivo: dto.motivo,
        rejeitado_por: userId,
      });
      return u;
    });
  }

  // ---------------- consultas ----------------

  async pipeline(filtros: { responsavel_id?: string; cliente_id?: string }) {
    const where: Prisma.OrcamentoWhereInput = {
      amostra_status: { not: 'nao_solicitada' },
    };
    if (filtros.responsavel_id) where.amostra_responsavel_id = filtros.responsavel_id;
    if (filtros.cliente_id) where.cliente_id = filtros.cliente_id;

    const orcs = await this.prisma.orcamento.findMany({
      where,
      orderBy: { amostra_solicitada_em: 'asc' },
      select: {
        id: true,
        numero: true,
        produto: true,
        amostra_status: true,
        amostra_qtd: true,
        amostra_solicitada_em: true,
        amostra_responsavel_id: true,
        cliente: { select: { id: true, nome: true } },
        amostra_responsavel: { select: { nome: true } },
      },
    });

    const grupos: Record<string, any[]> = {};
    for (const s of ORDEM_PIPELINE) grupos[s] = [];
    for (const o of orcs) (grupos[o.amostra_status] ??= []).push(o);
    return {
      total: orcs.length,
      grupos: ORDEM_PIPELINE.map((status) => ({ status, itens: grupos[status] })),
    };
  }

  async eventos(id: string) {
    await this.buscar(id);
    return this.prisma.amostraEvento.findMany({
      where: { orcamento_id: id },
      orderBy: { registrado_em: 'asc' },
      include: { registrador: { select: { nome: true } } },
    });
  }

  // ---------------- helpers ----------------

  private async buscar(id: string) {
    const orc = await this.prisma.orcamento.findUnique({ where: { id } });
    if (!orc) throw new NotFoundException('Orcamento nao encontrado');
    return orc;
  }

  private async exigirStatus(id: string, esperado: string) {
    const orc = await this.buscar(id);
    if (orc.amostra_status !== esperado) {
      throw new BadRequestException(
        `Transicao invalida: amostra_status precisa ser '${esperado}' (atual: '${orc.amostra_status}').`,
      );
    }
    return orc;
  }

  private evento(
    tx: Prisma.TransactionClient,
    orcamentoId: string,
    de: string | null,
    para: string,
    obs: string | undefined,
    userId: string,
  ) {
    return tx.amostraEvento.create({
      data: {
        orcamento_id: orcamentoId,
        status_anterior: de,
        status_novo: para,
        observacao: obs,
        registrado_por: userId,
      },
    });
  }

  private integration(
    tx: Prisma.TransactionClient,
    tipo: string,
    orc: { id: string; numero: number; produto: string; cliente_id: string | null },
    extra: Record<string, unknown>,
  ) {
    return tx.integrationEvent.create({
      data: {
        tipo,
        entidade_tipo: 'orcamento',
        entidade_id: orc.id,
        payload: {
          orcamento_numero: orc.numero,
          produto: orc.produto,
          cliente_id: orc.cliente_id,
          ...extra,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private addDias(d: Date, dias: number) {
    const r = new Date(d);
    r.setDate(r.getDate() + dias);
    return r;
  }
}
