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
import { MudarStatusDto } from './dto/mudar-status.dto';
import { resolverNcmEfetivo } from './ncm-efetivo.util';
import { validarTransicao } from './status-orcamento.util';
import { PendenciasLabService } from '../pendencias-lab/pendencias-lab.service';

export interface ListarOrcamentoQuery {
  status?: string;
  cliente_id?: string;
  /** FASE 3 — filtro por motivo de recusa (só faz sentido com status=recusado). */
  motivo?: string;
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
    // FASE 3 — gatilho recusa-por-fórmula. Chamada DIRETA (decisão travada):
    // acíclico hoje (PendenciasLabModule importa só FormulasModule e resolve
    // orcamento_id via Prisma, nunca via OrcamentosService). Se aparecerem
    // múltiplos consumidores, migra pra evento — o schema não muda.
    private readonly pendenciasLab: PendenciasLabService,
  ) {}

  async findAll(query: ListarOrcamentoQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const where: Prisma.OrcamentoWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.motivo) where.recusa_motivo = query.motivo; // FASE 3
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

  // Dashboard — agregações (por status + volume mensal dos últimos 12 meses).
  async stats() {
    const [porStatusRaw, por_mes] = await Promise.all([
      this.prisma.orcamento.groupBy({ by: ['status'], _count: true }),
      this.prisma.$queryRaw<Array<{ mes: string; count: number }>>`
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS mes,
               COUNT(*)::int AS count
        FROM orcamentos
        WHERE created_at >= date_trunc('month', now()) - interval '11 months'
        GROUP BY 1
        ORDER BY 1
      `,
    ]);
    const por_status = porStatusRaw
      .map((g) => ({ status: g.status, count: g._count }))
      .sort((a, b) => b.count - a.count);
    return { por_status, por_mes };
  }

  async findOne(id: string) {
    const orc = await this.prisma.orcamento.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nome: true } },
        formula: {
          select: {
            id: true, nome_produto: true, versao_codigo: true, status: true,
            ncm_id: true,
            ncm: { select: { id: true, ncm: true, descricao: true, ipi_pct: true, monofasico: true } },
          },
        },
        // override de NCM do proprio orcamento (F3)
        ncm: { select: { id: true, ncm: true, descricao: true, ipi_pct: true, monofasico: true } },
      },
    });
    if (!orc) throw new NotFoundException('Orcamento nao encontrado');

    // NCM efetivo: READ-ONLY computado, NUNCA persistido (snapshot stale). A F4
    // usa a MESMA resolverNcmEfetivo no engine. override do orcamento vence.
    const ncm_efetivo = resolverNcmEfetivo(orc.ncm_id, orc.formula?.ncm_id ?? null);
    const ncm_efetivo_origem =
      orc.ncm_id != null ? 'orcamento' : orc.formula?.ncm_id != null ? 'formula' : null;

    return { ...orc, ncm_efetivo, ncm_efetivo_origem };
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
        ncm_id: dto.ncm_id, // override cru (Opcao A); herda da formula no consumo
        modo_operacao: dto.modo_operacao, // F4 Fase A (D2); null = full_service
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
        ncm_id: o.ncm_id, // preserva o override de NCM ao duplicar
        modo_operacao: o.modo_operacao, // preserva o modo fiscal ao duplicar
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
        // BUG #50: o snap da embalagem era resolvido no cálculo mas NUNCA
        // persistido — briefing/PDF liam embalagem_snapshot null. Trava o
        // vínculo aqui, junto com o preço (mesmo momento do JSON_CALC).
        embalagem_snapshot: ((r.calculo as { embalagem?: unknown }).embalagem ??
          undefined) as Prisma.InputJsonValue,
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

  /**
   * P1 — transição de status com máquina de estados (não pula etapas).
   * rascunho->enviado (exige calculado); enviado->aprovado_cliente|recusado.
   * [HOOK fase 4]: motivo categorizado da recusa + auto-pendência de lab.
   */
  /**
   * P1 + FASE 3 — transição de status. Recusar exige motivo categorizado, e
   * motivo='formula' dispara a criação de uma pendência de revisão no lab.
   *
   * FRONTEIRA (tese 2): esta função escreve APENAS status + as 3 colunas de
   * recusa. Nunca toca `calculo`, `formula_composicao_snapshot` nem
   * `embalagem_snapshot` — o preço congelado só é escrito em `calcular()`.
   *
   * SOBERANIA DA CAPTURA: o motivo é gravado ANTES do gatilho e o gatilho roda
   * em try/catch. Recusa NUNCA falha por causa da pendência — se ela não puder
   * nascer, o motivo continua registrado e a resposta traz o aviso.
   */
  async mudarStatus(id: string, dto: MudarStatusDto, userId: string) {
    const orc = await this.prisma.orcamento.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        status: true,
        calculo: true,
        formula_id: true,
        produto: true,
        formula: { select: { id: true, status: true, nome_produto: true } },
      },
    });
    if (!orc) throw new NotFoundException('Orcamento nao encontrado');

    const novoStatus = dto.status;
    const ehRecusa = novoStatus === 'recusado';
    const motivo = ehRecusa ? (dto.motivo ?? null) : null;

    const r = validarTransicao(orc.status, novoStatus, orc.calculo !== null, motivo);
    if (!r.ok) throw new BadRequestException(r.erro);

    // Motivo entra na MESMA update do status: ou os dois gravam, ou nenhum.
    const atualizado = await this.prisma.orcamento.update({
      where: { id },
      data: {
        status: novoStatus,
        ...(ehRecusa
          ? {
              recusa_motivo: motivo,
              recusa_observacao: dto.observacao?.trim() || null,
              recusa_em: new Date(),
            }
          : {}),
      },
    });
    await this.audit.registrar({
      userId,
      acao: 'mudar_status_orcamento',
      entidade: 'orcamento',
      entidadeId: id,
      detalhes: {
        numero: orc.numero,
        de: orc.status,
        para: novoStatus,
        ...(ehRecusa ? { motivo, observacao: dto.observacao?.trim() || null } : {}),
      },
    });

    // ---- GATILHO (D2d): recusa por FÓRMULA -> pendência de revisão no lab ----
    // Só aqui nasce pendência. Os outros 3 motivos são registro puro.
    let aviso: string | null = null;
    let pendencia_criada: { id: number } | null = null;
    if (ehRecusa && motivo === 'formula') {
      // Guarda (decisão 3): sem fórmula OU fórmula em rascunho -> não cria.
      // `criar()` exige formula_base_id, e `atender()` barra base não-validada:
      // uma pendência nascida aqui ficaria travada no atender. Melhor não nascer
      // e avisar do que criar lixo na fila do lab.
      if (!orc.formula_id || !orc.formula) {
        aviso =
          'Motivo registrado. Pendência de revisão NÃO criada: este orçamento não tem fórmula vinculada — atribua uma fórmula antes de pedir revisão ao laboratório.';
      } else if (orc.formula.status !== 'validada') {
        aviso = `Motivo registrado. Pendência de revisão NÃO criada: a fórmula "${orc.formula.nome_produto}" está em ${orc.formula.status} — revisão só parte de fórmula VALIDADA (a versão nova nasce dela). Valide-a e abra a revisão pelo laboratório.`;
      } else {
        const obs = dto.observacao?.trim();
        const descricao = [
          `Revisão solicitada pela recusa do orçamento #${orc.numero} (${orc.produto}).`,
          `Motivo: fórmula.`,
          obs ? `Observação do comercial: ${obs}` : null,
        ]
          .filter(Boolean)
          .join('\n');
        try {
          const p = await this.pendenciasLab.criar(
            {
              tipo: 'revisao',
              urgencia: dto.urgencia ?? 'dois_tres_dias',
              descricao,
              formula_base_id: orc.formula_id,
              orcamento_id: id,
              motivo_origem: 'reprovado_por_custo',
            },
            userId,
          );
          pendencia_criada = { id: p.id };
        } catch (e) {
          // Captura é soberana: a recusa já está gravada e NÃO é desfeita.
          const msg = e instanceof Error ? e.message : String(e);
          aviso = `Motivo registrado. A pendência de revisão não pôde ser criada (${msg}). Abra a revisão manualmente pelo laboratório.`;
        }
      }
    }

    return { ...atualizado, aviso, pendencia_criada };
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
