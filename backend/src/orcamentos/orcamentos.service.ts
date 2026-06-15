import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CalculoService } from './calculo.service';
import { FormatacaoService } from './formatacao.service';
import { PdfService } from './pdf.service';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import { CalcularDto } from './dto/calcular.dto';

export interface ListarOrcamentoQuery {
  status?: string;
  cliente_id?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class OrcamentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly calculo: CalculoService,
    private readonly formatacao: FormatacaoService,
    private readonly pdf: PdfService,
  ) {}

  async findAll(query: ListarOrcamentoQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const where: Prisma.OrcamentoWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.cliente_id) where.cliente_id = query.cliente_id;
    if (query.q) where.produto = { contains: query.q, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.orcamento.findMany({
        where,
        orderBy: { numero: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { cliente: { select: { id: true, nome: true } } },
      }),
      this.prisma.orcamento.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const orc = await this.prisma.orcamento.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nome: true } },
        formula: { select: { id: true, nome_produto: true, versao_codigo: true, status: true } },
      },
    });
    if (!orc) throw new NotFoundException('Orcamento nao encontrado');
    return orc;
  }

  create(dto: CreateOrcamentoDto, userId: string) {
    return this.prisma.orcamento.create({
      data: {
        produto: dto.produto,
        cliente_id: dto.cliente_id,
        categoria: dto.categoria,
        nivel: dto.nivel,
        volume_un: dto.volume_un,
        quantidade: dto.quantidade,
        margem_pct: dto.margem_pct,
        formula_id: dto.formula_id,
        embalagem: dto.embalagem,
        un_min: dto.un_min,
        embalagem_id: dto.embalagem_id,
        sem_embalagem: dto.sem_embalagem ?? false,
        budget_mp: dto.budget_mp,
        produto_referencia: dto.produto_referencia,
        requer_amostra: dto.requer_amostra ?? true,
        amostra_qtd: dto.amostra_qtd,
        status: 'rascunho',
        created_by: userId,
      },
    });
  }

  async update(id: string, dto: UpdateOrcamentoDto) {
    await this.ensure(id);
    return this.prisma.orcamento.update({ where: { id }, data: dto });
  }

  async duplicar(id: string, userId: string) {
    const o = await this.findOne(id);
    return this.prisma.orcamento.create({
      data: {
        produto: o.produto,
        cliente_id: o.cliente_id,
        categoria: o.categoria,
        nivel: o.nivel,
        volume_un: o.volume_un,
        quantidade: o.quantidade,
        margem_pct: o.margem_pct,
        formula_id: o.formula_id,
        embalagem: o.embalagem,
        un_min: o.un_min,
        embalagem_id: o.embalagem_id,
        sem_embalagem: o.sem_embalagem,
        budget_mp: o.budget_mp,
        produto_referencia: o.produto_referencia,
        requer_amostra: o.requer_amostra,
        amostra_qtd: o.amostra_qtd,
        status: 'rascunho',
        created_by: userId,
      },
    });
  }

  /** FASE 1 — cálculo único. Gera e TRAVA o JSON_CALC no orcamento. */
  async calcular(id: string, dto: CalcularDto, userId: string) {
    await this.ensure(id);
    const r = await this.calculo.gerarCalculo(id, dto);
    const atualizado = await this.prisma.orcamento.update({
      where: { id },
      data: {
        calculo: r.calculo as unknown as Prisma.InputJsonValue,
        preco_sipi: r.preco_sipi,
        preco_cipi: r.preco_cipi,
        score_global: r.score_global,
        formula_versao_codigo: r.formula_versao_codigo,
        formula_status_momento: r.formula_status_momento,
        formula_composicao_snapshot: (r.formula_composicao_snapshot ?? undefined) as Prisma.InputJsonValue,
      },
    });
    await this.audit.registrar({
      userId,
      acao: 'calcular_orcamento',
      entidade: 'orcamento',
      entidadeId: id,
      detalhes: {
        modo: (r.calculo as any)._mode,
        preco_sipi: r.preco_sipi,
        preco_cipi: r.preco_cipi,
        score: r.score_global,
      },
    });
    return atualizado;
  }

  /** FASE 2 — formata as 4 paginas a partir do JSON_CALC travado. */
  async formatar(id: string, userId: string) {
    await this.ensure(id);
    const r = await this.formatacao.formatar(id);
    await this.audit.registrar({
      userId,
      acao: 'formatar_orcamento',
      entidade: 'orcamento',
      entidadeId: id,
      detalhes: { modo: r._mode },
    });
    return r;
  }

  /**
   * PDF INTERNO do orcamento (Dia 14). Espelha a tela de detalhe. Exige o
   * JSON_CALC travado (400 se ainda nao calculado). Stream em memoria.
   */
  async gerarPdf(id: string, userId: string) {
    const orc = await this.findOne(id); // 404 embutido
    if (!orc.calculo) {
      throw new BadRequestException(
        'Calcule o orcamento antes de exportar o PDF.',
      );
    }
    const buffer = await this.pdf.gerar(orc);
    await this.audit.registrar({
      userId,
      acao: 'exportar_pdf_orcamento',
      entidade: 'orcamento',
      entidadeId: id,
      detalhes: { numero: orc.numero, bytes: buffer.length },
    });
    return { buffer, filename: `orcamento-${orc.numero}.pdf` };
  }

  private async ensure(id: string) {
    const o = await this.prisma.orcamento.findUnique({ where: { id }, select: { id: true } });
    if (!o) throw new NotFoundException('Orcamento nao encontrado');
  }
}
