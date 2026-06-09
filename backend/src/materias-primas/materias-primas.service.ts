import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AlertasService } from '../alertas/alertas.service';
import { CreateMpDto } from './dto/create-mp.dto';
import { UpdateMpDto } from './dto/update-mp.dto';
import { AtualizarPrecoDto } from './dto/atualizar-preco.dto';

export interface ListarMpQuery {
  q?: string;
  fornecedor?: string;
  vencidas?: boolean; // cotacao > 12 meses (ou sem data)
  page?: number;
  pageSize?: number;
}

@Injectable()
export class MateriasPrimasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly alertas: AlertasService,
  ) {}

  async findAll(query: ListarMpQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const where: Prisma.MateriaPrimaWhereInput = {};

    if (query.q) where.nome = { contains: query.q, mode: 'insensitive' };
    if (query.fornecedor)
      where.fornecedor = { contains: query.fornecedor, mode: 'insensitive' };
    if (query.vencidas) {
      const limite = new Date();
      limite.setMonth(limite.getMonth() - 12);
      where.OR = [{ data_cotacao: { lt: limite } }, { data_cotacao: null }];
    }

    const [data, total] = await Promise.all([
      this.prisma.materiaPrima.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.materiaPrima.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findByCodigo(codigo: number) {
    const mp = await this.prisma.materiaPrima.findUnique({
      where: { codigo },
      include: { fornecedores_alt: true },
    });
    if (!mp) throw new NotFoundException('Materia-prima nao encontrada');
    return mp;
  }

  async create(dto: CreateMpDto) {
    const existe = await this.prisma.materiaPrima.findUnique({ where: { codigo: dto.codigo } });
    if (existe) throw new ConflictException(`Ja existe MP com codigo ${dto.codigo}`);
    return this.prisma.materiaPrima.create({
      data: {
        codigo: dto.codigo,
        nome: dto.nome,
        preco_kg_brl: dto.preco_kg_brl,
        fornecedor: dto.fornecedor,
        embalagem_minima: dto.embalagem_minima,
        data_cotacao: dto.data_cotacao ? new Date(dto.data_cotacao) : undefined,
        validade_cotacao: dto.validade_cotacao,
        observacoes: dto.observacoes,
      },
    });
  }

  async update(codigo: number, dto: UpdateMpDto) {
    await this.findByCodigo(codigo);
    return this.prisma.materiaPrima.update({ where: { codigo }, data: dto });
  }

  /** Formulas que usam esta MP (join via formula_composicao). */
  async formulasQueUsam(codigo: number) {
    const mp = await this.findByCodigo(codigo);
    return this.prisma.formula.findMany({
      where: { composicao: { some: { mp_id: mp.id } } },
      select: {
        id: true,
        nome_produto: true,
        versao_codigo: true,
        status: true,
        categoria: true,
        custo_mp_kg: true,
      },
      orderBy: { nome_produto: 'asc' },
    });
  }

  async historico(codigo: number) {
    const mp = await this.findByCodigo(codigo);
    return this.prisma.mpHistoricoPreco.findMany({
      where: { mp_id: mp.id },
      orderBy: [{ data_cotacao: 'desc' }, { registrado_em: 'desc' }],
      include: { registrador: { select: { nome: true } } },
    });
  }

  async historicoGrafico(codigo: number) {
    const mp = await this.findByCodigo(codigo);
    const rows = await this.prisma.mpHistoricoPreco.findMany({
      where: { mp_id: mp.id },
      orderBy: { data_cotacao: 'asc' },
      select: { data_cotacao: true, preco_kg_brl: true, origem: true },
    });
    return rows.map((r) => ({
      data: r.data_cotacao,
      preco: Number(r.preco_kg_brl),
      origem: r.origem,
    }));
  }

  /**
   * Atualizacao Direta de preco (Doc 2b §B2). Tudo em transacao:
   *  1) cria mp_historico_precos  2) atualiza materias_primas
   *  3) audit_log  4) alerta in-app se variacao >= threshold
   */
  async atualizarPreco(codigo: number, dto: AtualizarPrecoDto, userId: string) {
    const mp = await this.findByCodigo(codigo);
    const anterior = mp.preco_kg_brl !== null ? Number(mp.preco_kg_brl) : null;
    const novo = dto.preco_kg_brl;
    const variacao =
      anterior !== null && anterior > 0
        ? Number((((novo - anterior) / anterior) * 100).toFixed(2))
        : null;

    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 1 } });
    const threshold = cfg ? Number(cfg.alerta_aumento_mp_pct) : 20;
    const alertasAtivos = cfg ? cfg.alertas_ativos : true;
    const aumentoRelevante = variacao !== null && variacao >= threshold;

    const dataCotacao = new Date(dto.data_cotacao);

    const resultado = await this.prisma.$transaction(async (tx) => {
      const historico = await tx.mpHistoricoPreco.create({
        data: {
          mp_id: mp.id,
          preco_kg_brl: novo,
          preco_anterior_kg: anterior ?? undefined,
          variacao_pct: variacao ?? undefined,
          fornecedor: dto.fornecedor,
          data_cotacao: dataCotacao,
          origem: 'atualizacao_rapida',
          fonte_info: dto.fonte_info,
          observacoes: dto.observacoes,
          registrado_por: userId,
        },
      });

      const mpAtualizada = await tx.materiaPrima.update({
        where: { id: mp.id },
        data: {
          preco_anterior: anterior ?? undefined,
          preco_kg_brl: novo,
          aumento_pct: variacao ?? undefined,
          fornecedor: dto.fornecedor,
          data_cotacao: dataCotacao,
          flag_aumento_relevante: aumentoRelevante,
        },
      });

      await this.audit.registrar(
        {
          userId,
          acao: 'atualizar_preco_mp',
          entidade: 'materia_prima',
          entidadeId: mp.codigo,
          detalhes: {
            de: anterior,
            para: novo,
            variacao_pct: variacao,
            fornecedor: dto.fornecedor,
            fonte: dto.fonte_info,
          },
        },
        tx,
      );

      let alerta = null;
      if (aumentoRelevante && alertasAtivos) {
        alerta = await this.alertas.gerarAlertaAumento(
          {
            mpNome: mp.nome,
            precoAntigo: anterior as number,
            precoNovo: novo,
            variacaoPct: variacao as number,
            nFormulas: mp.n_formulas_uso,
            mpId: mp.id,
          },
          tx,
        );
      }

      return { mp: mpAtualizada, historico, alerta };
    });

    return {
      ...resultado,
      variacao_pct: variacao,
      gerou_alerta: !!resultado.alerta,
      score_resetado: 98, // cotacao recente => score maximo (Doc 1 §7)
    };
  }
}
