import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateEmbalagemDto } from './dto/create-embalagem.dto';
import { UpdateEmbalagemDto } from './dto/update-embalagem.dto';
import { AtualizarPrecoEmbDto } from './dto/atualizar-preco-emb.dto';

export interface ListarEmbQuery {
  q?: string;
  tipo?: string;
  fornecedor?: string;
  material?: string;
  sem_cotacao?: boolean; // sem preco ou preco estimado (Doc 2d §B5)
  ativo?: boolean;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class EmbalagensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: ListarEmbQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const where: Prisma.EmbalagemWhereInput = {};

    if (query.q) where.nome = { contains: query.q, mode: 'insensitive' };
    if (query.tipo) where.tipo = query.tipo;
    if (query.fornecedor)
      where.fornecedor = { contains: query.fornecedor, mode: 'insensitive' };
    if (query.material)
      where.material = { contains: query.material, mode: 'insensitive' };
    if (query.ativo !== undefined) where.ativo = query.ativo;
    if (query.sem_cotacao)
      where.OR = [{ preco_un_brl: null }, { preco_estimado: true }];

    const [data, total] = await Promise.all([
      this.prisma.embalagem.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.embalagem.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findById(id: number) {
    const e = await this.prisma.embalagem.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Embalagem nao encontrada');
    return e;
  }

  async create(dto: CreateEmbalagemDto, userId: string) {
    if (dto.codigo) {
      const existe = await this.prisma.embalagem.findUnique({ where: { codigo: dto.codigo } });
      if (existe) throw new ConflictException(`Ja existe embalagem com codigo ${dto.codigo}`);
    }
    const dataCotacao = dto.data_cotacao ? new Date(dto.data_cotacao) : undefined;
    // preco_estimado: explicito; senao true quando nao ha preco (sem cotacao)
    const precoEstimado = dto.preco_estimado ?? dto.preco_un_brl == null;

    const emb = await this.prisma.embalagem.create({
      data: {
        codigo: dto.codigo,
        nome: dto.nome,
        tipo: dto.tipo,
        volume_ml: dto.volume_ml,
        material: dto.material,
        cor: dto.cor,
        preco_un_brl: dto.preco_un_brl,
        fornecedor: dto.fornecedor,
        prazo_entrega: dto.prazo_entrega,
        preco_estimado: precoEstimado,
        data_cotacao: dataCotacao,
        observacoes: dto.observacoes,
        created_by: userId,
      },
    });

    // historico inicial quando ja nasce com preco
    if (dto.preco_un_brl != null) {
      await this.prisma.embHistoricoPreco.create({
        data: {
          embalagem_id: emb.id,
          preco_un_brl: dto.preco_un_brl,
          fornecedor: dto.fornecedor,
          data_cotacao: dataCotacao ?? new Date(),
          origem: 'criacao',
          registrado_por: userId,
        },
      });
    }

    await this.audit.registrar({
      userId,
      acao: 'criar_embalagem',
      entidade: 'embalagem',
      entidadeId: emb.id,
      detalhes: { nome: emb.nome, tipo: emb.tipo, preco_un_brl: dto.preco_un_brl ?? null },
    });
    return emb;
  }

  async update(id: number, dto: UpdateEmbalagemDto, userId: string) {
    await this.findById(id);
    const emb = await this.prisma.embalagem.update({ where: { id }, data: dto });
    await this.audit.registrar({
      userId,
      acao: 'editar_embalagem',
      entidade: 'embalagem',
      entidadeId: id,
      detalhes: { ...dto } as Prisma.InputJsonValue,
    });
    return emb;
  }

  async historico(id: number) {
    await this.findById(id);
    return this.prisma.embHistoricoPreco.findMany({
      where: { embalagem_id: id },
      orderBy: [{ data_cotacao: 'desc' }, { registrado_em: 'desc' }],
      include: { registrador: { select: { nome: true } } },
    });
  }

  /** Orcamentos que usaram esta embalagem (Doc 2d §B5). */
  async orcamentosQueUsam(id: number) {
    await this.findById(id);
    return this.prisma.orcamento.findMany({
      where: { embalagem_id: id },
      select: { id: true, numero: true, produto: true, status: true, preco_cipi: true },
      orderBy: { numero: 'desc' },
    });
  }

  /**
   * Atualizacao Direta de preco (espelha MP — Doc 2d §B3). Em transacao:
   *  1) cria emb_historico_precos  2) atualiza embalagens (preco_estimado=false)  3) audit_log
   */
  async atualizarPreco(id: number, dto: AtualizarPrecoEmbDto, userId: string) {
    const emb = await this.findById(id);
    const anterior = emb.preco_un_brl != null ? Number(emb.preco_un_brl) : null;
    const novo = dto.preco_un_brl;
    const variacao =
      anterior !== null && anterior > 0
        ? Number((((novo - anterior) / anterior) * 100).toFixed(2))
        : null;
    const dataCotacao = new Date(dto.data_cotacao);

    return this.prisma.$transaction(async (tx) => {
      const historico = await tx.embHistoricoPreco.create({
        data: {
          embalagem_id: emb.id,
          preco_un_brl: novo,
          preco_anterior_un: anterior ?? undefined,
          variacao_pct: variacao ?? undefined,
          fornecedor: dto.fornecedor,
          data_cotacao: dataCotacao,
          origem: 'atualizacao_rapida',
          fonte_info: dto.fonte_info,
          observacoes: dto.observacoes,
          registrado_por: userId,
        },
      });

      const atualizada = await tx.embalagem.update({
        where: { id: emb.id },
        data: {
          preco_un_brl: novo,
          fornecedor: dto.fornecedor ?? emb.fornecedor,
          data_cotacao: dataCotacao,
          preco_estimado: false, // agora e cotado
        },
      });

      await this.audit.registrar(
        {
          userId,
          acao: 'atualizar_preco_embalagem',
          entidade: 'embalagem',
          entidadeId: emb.id,
          detalhes: { de: anterior, para: novo, variacao_pct: variacao, fornecedor: dto.fornecedor },
        },
        tx,
      );

      return { embalagem: atualizada, historico, variacao_pct: variacao };
    });
  }
}
