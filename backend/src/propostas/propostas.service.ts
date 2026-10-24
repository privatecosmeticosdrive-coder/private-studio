import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AlertasService } from '../alertas/alertas.service';
import { validarTransicao } from '../orcamentos/status-orcamento.util';
import type { AjusteFac } from '../orcamentos/fac.util';
import { CONDICOES_PADRAO, montarCondicoes, textoFornecimento } from './proposta-condicoes';
import type { AssinarPropostaDto, CreatePropostaDto } from './dto/proposta.dto';
import { PropostaPdfService, type PropostaPdf } from './proposta-pdf.service';

/** Preco congelado de cada orcamento no momento da emissao. */
export interface SnapshotItemProposta {
  numero: number;
  versao: number;
  produto: string;
  volume_un: number | null;
  quantidade: number | null;
  preco_sipi: number;
  preco_cipi: number;
  ipi_pct: number | null;
  /** Preco sem a embalagem (Motor 2); null quando nao ha embalagem precificada. */
  preco_sem_embalagem_sipi: number | null;
  com_embalagem: boolean;
  embalagem: string | null;
  fornecimento: string;
  fac: boolean;
}

type CalculoLido = {
  resultado?: { ipi_pct?: number; preco_produto_sipi?: number; preco_embalagem_sipi?: number };
  embalagem_precificacao?: { precificada?: boolean };
};

/**
 * PROPOSTA COMERCIAL (10/26). Um cliente, N orcamentos (um por formula), um
 * documento. Emitir leva os rascunhos calculados para "enviado"; assinar leva
 * os enviados para "aprovado_cliente" e libera a amostragem.
 */
@Injectable()
export class PropostasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly alertas: AlertasService,
    private readonly pdf: PropostaPdfService,
  ) {}

  condicoesPadrao() {
    return CONDICOES_PADRAO;
  }

  findAll(query: { cliente_id?: string; status?: string }) {
    const where: Prisma.PropostaWhereInput = {};
    if (query.cliente_id) where.cliente_id = query.cliente_id;
    if (query.status) where.status = query.status;
    return this.prisma.proposta.findMany({
      where,
      orderBy: { numero: 'desc' },
      take: 200,
      include: {
        cliente: { select: { id: true, nome: true } },
        _count: { select: { itens: true } },
      },
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.proposta.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nome: true, cnpj: true, email: true, telefone: true, uf: true } },
        itens: {
          orderBy: { ordem: 'asc' },
          include: { orcamento: { select: { id: true, numero: true, status: true, amostra_status: true } } },
        },
      },
    });
    if (!p) throw new NotFoundException('Proposta nao encontrada');
    return p;
  }

  async create(dto: CreatePropostaDto, user: { sub: string; nome: string }) {
    const ids = [...new Set(dto.orcamento_ids)];
    const [cliente, orcs] = await Promise.all([
      this.prisma.cliente.findUnique({ where: { id: dto.cliente_id }, select: { id: true, nome: true } }),
      this.prisma.orcamento.findMany({
        where: { id: { in: ids } },
        include: {
          proposta_itens: { select: { proposta: { select: { numero: true, status: true } } } },
        },
      }),
    ]);
    if (!cliente) throw new NotFoundException('Cliente nao encontrado');
    if (orcs.length !== ids.length) throw new BadRequestException('Algum orcamento selecionado nao existe.');

    const problemas: string[] = [];
    for (const o of orcs) {
      const rotulo = `#${o.numero} ${o.produto}`;
      if (o.cliente_id !== cliente.id) problemas.push(`${rotulo} e de outro cliente`);
      if (o.excluido_em) problemas.push(`${rotulo} foi excluido`);
      if (o.calculo == null || o.preco_sipi == null) problemas.push(`${rotulo} nao esta calculado`);
      if (!['rascunho', 'enviado'].includes(o.status)) problemas.push(`${rotulo} esta '${o.status}'`);
      const assinada = o.proposta_itens.find((i) => i.proposta.status === 'assinada');
      if (assinada) problemas.push(`${rotulo} ja esta na proposta ${assinada.proposta.numero}, assinada`);
    }
    if (problemas.length) throw new BadRequestException(`Nao da para emitir: ${problemas.join('; ')}.`);

    const ordem = new Map(ids.map((id, i) => [id, i]));
    orcs.sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0));
    const condicoes = montarCondicoes(dto.condicoes);

    const proposta = await this.prisma.$transaction(async (tx) => {
      const p = await tx.proposta.create({
        data: {
          cliente_id: cliente.id,
          condicoes: condicoes as unknown as Prisma.InputJsonValue,
          observacoes: dto.observacoes?.trim() || null,
          vendedor_nome: user.nome,
          emitida_por: user.sub,
          itens: {
            create: orcs.map((o, i) => ({
              orcamento_id: o.id,
              ordem: i + 1,
              snapshot: this.snapshot(o) as unknown as Prisma.InputJsonValue,
            })),
          },
        },
      });
      // Rascunho calculado vai para "enviado" (a proposta e o envio ao cliente).
      for (const o of orcs.filter((x) => x.status === 'rascunho')) {
        const v = validarTransicao(o.status, 'enviado', o.calculo != null);
        if (!v.ok) throw new BadRequestException(`#${o.numero}: ${v.erro}`);
        await tx.orcamento.update({ where: { id: o.id }, data: { status: 'enviado' } });
      }
      await this.audit.registrar(
        {
          userId: user.sub,
          acao: 'emitir_proposta',
          entidade: 'proposta',
          entidadeId: p.id,
          detalhes: { numero: p.numero, cliente: cliente.nome, orcamentos: orcs.map((o) => o.numero) },
        },
        tx,
      );
      return p;
    });
    return this.findOne(proposta.id);
  }

  /**
   * Registra o aceite do cliente (proposta assinada). Os orcamentos "enviado"
   * passam a "aprovado_cliente" (libera a amostragem) e as FAC aprovadas avisam o lab.
   */
  async assinar(id: string, dto: AssinarPropostaDto, userId: string) {
    const p = await this.findOne(id);
    if (p.status !== 'emitida') throw new BadRequestException(`Proposta esta '${p.status}'.`);
    const orcs = await this.prisma.orcamento.findMany({
      where: { id: { in: p.itens.map((i) => i.orcamento_id) } },
      select: { id: true, numero: true, produto: true, status: true, ajuste_fac: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.proposta.update({
        where: { id },
        data: {
          status: 'assinada',
          assinada_em: dto.assinada_em ? new Date(dto.assinada_em) : new Date(),
          assinada_por_nome: dto.assinada_por_nome.trim(),
          assinada_por_documento: dto.assinada_por_documento?.trim() || null,
          assinatura_registrada_por: userId,
        },
      });
      for (const o of orcs) {
        if (o.status === 'enviado') {
          await tx.orcamento.update({ where: { id: o.id }, data: { status: 'aprovado_cliente' } });
        }
        const fac = o.ajuste_fac as AjusteFac | null;
        if (fac) {
          await this.alertas.gerarAlertaFac(
            {
              numero: o.numero,
              produto: o.produto,
              cliente: p.cliente.nome,
              evento: 'aprovado',
              itens: fac.itens,
              compensacao: fac.compensacao,
            },
            tx,
          );
        }
      }
      await this.audit.registrar(
        {
          userId,
          acao: 'assinar_proposta',
          entidade: 'proposta',
          entidadeId: id,
          detalhes: { numero: p.numero, assinada_por: dto.assinada_por_nome, orcamentos: orcs.map((o) => o.numero) },
        },
        tx,
      );
    });
    return this.findOne(id);
  }

  async cancelar(id: string, motivo: string | undefined, userId: string) {
    const p = await this.findOne(id);
    if (p.status === 'cancelada') throw new BadRequestException('Proposta ja cancelada.');
    if (p.status === 'assinada') {
      throw new BadRequestException('Proposta assinada nao se cancela aqui: o compromisso com o cliente ja existe.');
    }
    await this.prisma.proposta.update({
      where: { id },
      data: { status: 'cancelada', cancelada_em: new Date(), cancelada_por: userId, cancelamento_motivo: motivo ?? null },
    });
    await this.audit.registrar({
      userId,
      acao: 'cancelar_proposta',
      entidade: 'proposta',
      entidadeId: id,
      detalhes: { numero: p.numero, motivo: motivo ?? null },
    });
    return this.findOne(id);
  }

  async gerarPdf(id: string) {
    const p = await this.findOne(id);
    const buffer = await this.pdf.gerar(p as unknown as PropostaPdf);
    const cliente = p.cliente.nome.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    return { buffer, filename: `Proposta-${p.numero}-${cliente}.pdf` };
  }

  private snapshot(o: {
    numero: number;
    versao: number;
    produto: string;
    volume_un: Prisma.Decimal | null;
    quantidade: number | null;
    preco_sipi: Prisma.Decimal | null;
    preco_cipi: Prisma.Decimal | null;
    calculo: Prisma.JsonValue;
    modo_operacao: string | null;
    sem_embalagem: boolean;
    embalagem_snapshot: Prisma.JsonValue;
    ajuste_fac: Prisma.JsonValue;
  }): SnapshotItemProposta {
    const c = (o.calculo ?? {}) as CalculoLido;
    const precificada = c.embalagem_precificacao?.precificada === true;
    const emb = (o.embalagem_snapshot ?? null) as { nome?: string } | null;
    return {
      numero: o.numero,
      versao: o.versao,
      produto: o.produto,
      volume_un: o.volume_un != null ? Number(o.volume_un) : null,
      quantidade: o.quantidade,
      preco_sipi: Number(o.preco_sipi),
      preco_cipi: Number(o.preco_cipi),
      ipi_pct: c.resultado?.ipi_pct ?? null,
      preco_sem_embalagem_sipi:
        precificada && c.resultado?.preco_produto_sipi != null ? c.resultado.preco_produto_sipi : null,
      com_embalagem: precificada,
      embalagem: precificada ? (emb?.nome ?? null) : null,
      fornecimento: textoFornecimento(o.modo_operacao, o.sem_embalagem),
      fac: o.ajuste_fac != null,
    };
  }
}
