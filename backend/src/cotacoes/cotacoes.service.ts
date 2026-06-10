import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AlertasService } from '../alertas/alertas.service';
import { CreateCotacaoDto, RejeitarCotacaoDto } from './dto/cotacao.dto';

@Injectable()
export class CotacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly alertas: AlertasService,
  ) {}

  findAll(status?: string) {
    return this.prisma.cotacaoPendente.findMany({
      where: status ? { status } : undefined,
      orderBy: { created_at: 'desc' },
      include: { mp: { select: { codigo: true, nome: true, preco_kg_brl: true } } },
    });
  }

  async findOne(id: number) {
    const c = await this.prisma.cotacaoPendente.findUnique({
      where: { id },
      include: { mp: { select: { codigo: true, nome: true, preco_kg_brl: true } } },
    });
    if (!c) throw new NotFoundException('Cotacao nao encontrada');
    return c;
  }

  async create(dto: CreateCotacaoDto, userId: string) {
    const mp = await this.prisma.materiaPrima.findUnique({ where: { id: dto.mp_id } });
    if (!mp) throw new BadRequestException('MP (mp_id) nao encontrada');
    return this.prisma.cotacaoPendente.create({
      data: {
        mp_id: dto.mp_id,
        fornecedor: dto.fornecedor,
        valor: dto.valor,
        quantidade: dto.quantidade,
        unidade: dto.unidade,
        prazo_entrega: dto.prazo_entrega,
        validade_cotacao: dto.validade_cotacao ? new Date(dto.validade_cotacao) : undefined,
        observacoes: dto.observacoes,
        status: 'aguardando',
        created_by: userId,
      },
    });
  }

  async validarPd(id: number, userId: string) {
    const c = await this.findOne(id);
    if (c.status !== 'aguardando') {
      throw new BadRequestException(`Cotacao precisa estar 'aguardando' (atual: '${c.status}').`);
    }
    const upd = await this.prisma.cotacaoPendente.update({
      where: { id },
      data: { status: 'validada_pd' },
    });
    await this.audit.registrar({ userId, acao: 'validar_cotacao_pd', entidade: 'cotacao', entidadeId: id });
    return upd;
  }

  async validarCompras(id: number, userId: string) {
    const c = await this.findOne(id);
    if (c.status !== 'validada_pd') {
      throw new BadRequestException(`Cotacao precisa estar 'validada_pd' (atual: '${c.status}').`);
    }
    const upd = await this.prisma.cotacaoPendente.update({
      where: { id },
      data: { status: 'validada_compras', validada_por: userId, validada_em: new Date() },
    });
    await this.audit.registrar({ userId, acao: 'validar_cotacao_compras', entidade: 'cotacao', entidadeId: id });
    return upd;
  }

  async rejeitar(id: number, dto: RejeitarCotacaoDto, userId: string) {
    const c = await this.findOne(id);
    if (c.status === 'integrada') {
      throw new BadRequestException('Cotacao ja integrada nao pode ser rejeitada.');
    }
    const upd = await this.prisma.cotacaoPendente.update({
      where: { id },
      data: { status: 'rejeitada' },
    });
    await this.audit.registrar({
      userId, acao: 'rejeitar_cotacao', entidade: 'cotacao', entidadeId: id,
      detalhes: { motivo: dto.motivo ?? null },
    });
    return upd;
  }

  /**
   * Integra a cotacao validada ao banco: aplica o preco na MP (igual ao fluxo
   * de atualizar-preco, mas origem='cotacao_validada') + historico + alerta.
   */
  async integrar(id: number, userId: string) {
    const c = await this.findOne(id);
    if (c.status !== 'validada_compras') {
      throw new BadRequestException(`Cotacao precisa estar 'validada_compras' (atual: '${c.status}').`);
    }
    if (!c.mp_id) throw new BadRequestException('Cotacao sem MP vinculada.');

    const mp = await this.prisma.materiaPrima.findUnique({ where: { id: c.mp_id } });
    if (!mp) throw new BadRequestException('MP da cotacao nao encontrada.');

    const qtd = c.quantidade != null ? Number(c.quantidade) : null;
    const valor = c.valor != null ? Number(c.valor) : 0;
    const precoKg = qtd && qtd > 0 ? Number((valor / qtd).toFixed(2)) : valor;

    const anterior = mp.preco_kg_brl != null ? Number(mp.preco_kg_brl) : null;
    const variacao =
      anterior !== null && anterior > 0
        ? Number((((precoKg - anterior) / anterior) * 100).toFixed(2))
        : null;

    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 1 } });
    const threshold = cfg ? Number(cfg.alerta_aumento_mp_pct) : 20;
    const alertasAtivos = cfg ? cfg.alertas_ativos : true;
    const aumentoRelevante = variacao !== null && variacao >= threshold;
    const hoje = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.mpHistoricoPreco.create({
        data: {
          mp_id: mp.id,
          preco_kg_brl: precoKg,
          preco_anterior_kg: anterior ?? undefined,
          variacao_pct: variacao ?? undefined,
          fornecedor: c.fornecedor,
          data_cotacao: hoje,
          origem: 'cotacao_validada',
          fonte_info: 'pedido_formal',
          observacoes: c.observacoes ?? undefined,
          registrado_por: userId,
        },
      });
      await tx.materiaPrima.update({
        where: { id: mp.id },
        data: {
          preco_anterior: anterior ?? undefined,
          preco_kg_brl: precoKg,
          aumento_pct: variacao ?? undefined,
          fornecedor: c.fornecedor,
          data_cotacao: hoje,
          flag_aumento_relevante: aumentoRelevante,
          validado_compras: true,
        },
      });
      const cot = await tx.cotacaoPendente.update({ where: { id }, data: { status: 'integrada' } });
      await this.audit.registrar(
        {
          userId, acao: 'integrar_cotacao', entidade: 'cotacao', entidadeId: id,
          detalhes: { mp_codigo: mp.codigo, de: anterior, para: precoKg, variacao_pct: variacao },
        },
        tx,
      );
      let alerta = null;
      if (aumentoRelevante && alertasAtivos) {
        alerta = await this.alertas.gerarAlertaAumento(
          {
            mpNome: mp.nome,
            precoAntigo: anterior as number,
            precoNovo: precoKg,
            variacaoPct: variacao as number,
            nFormulas: mp.n_formulas_uso,
            mpId: mp.id,
          },
          tx,
        );
      }
      return { cotacao: cot, mp_codigo: mp.codigo, preco_kg_aplicado: precoKg, variacao_pct: variacao, gerou_alerta: !!alerta };
    });
  }
}
