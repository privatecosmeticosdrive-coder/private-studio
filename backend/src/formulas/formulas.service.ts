import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ComposicaoItemDto } from './dto/composicao-item.dto';
import { CreateFormulaDto } from './dto/create-formula.dto';
import { UpdateFormulaDto } from './dto/update-formula.dto';
import { SOMA_MAX, SOMA_MIN, somaComposicao, somaValidaParaValidacao } from './soma-composicao.util';
import { NovaVersaoDto } from './dto/nova-versao.dto';
import { ValidarFormulaDto } from './dto/validar-formula.dto';
import { RevisarNcmDto } from './dto/revisar-ncm.dto';
import { SugerirSimilarDto } from './dto/sugerir-similar.dto';
import { scoreCotacao, faixaScore } from './score.util';

export interface ListarFormulaQuery {
  q?: string;
  categoria?: string;
  origem?: string;
  status?: string;
  cliente_id?: string;
  maes?: boolean; // apenas formulas-mae (familias)
  page?: number;
  pageSize?: number;
}

@Injectable()
export class FormulasService {
  constructor(private readonly prisma: PrismaService) {}

  // ----------------------- LISTAGEM -----------------------
  async findAll(query: ListarFormulaQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const where: Prisma.FormulaWhereInput = {};
    if (query.q) where.nome_produto = { contains: query.q, mode: 'insensitive' };
    if (query.categoria) where.categoria = query.categoria;
    if (query.origem) where.origem = query.origem;
    if (query.status) where.status = query.status;
    if (query.cliente_id) where.cliente_id = query.cliente_id;
    if (query.maes) where.formula_mae_id = null;

    const [data, total] = await Promise.all([
      this.prisma.formula.findMany({
        where,
        orderBy: { nome_produto: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          nome_produto: true,
          versao_codigo: true,
          versao_descricao: true,
          categoria: true,
          origem: true,
          status: true,
          cliente_id: true,
          custo_mp_kg: true,
          formula_mae_id: true,
          total_ingredientes: true,
          _count: query.maes ? { select: { versoes: true } } : undefined,
        },
      }),
      this.prisma.formula.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  // ----------------------- DETALHE -----------------------
  async findOne(id: number) {
    const formula = await this.prisma.formula.findUnique({
      where: { id },
      include: {
        composicao: {
          orderBy: { ordem: 'asc' },
          include: { mp: { select: { codigo: true, nome: true, preco_kg_brl: true, data_cotacao: true } } },
        },
        cliente: { select: { id: true, nome: true } },
        validador: { select: { nome: true } },
        formula_mae: { select: { id: true, nome_produto: true, versao_codigo: true } },
      },
    });
    if (!formula) throw new NotFoundException('Formula nao encontrada');
    const custo = await this.calcularCusto(id);
    return { ...formula, custo };
  }

  async versoes(id: number) {
    const f = await this.ensure(id);
    const raizId = f.formula_mae_id ?? f.id;
    const familia = await this.prisma.formula.findMany({
      where: { OR: [{ id: raizId }, { formula_mae_id: raizId }] },
      orderBy: { versao_codigo: 'asc' },
      select: {
        id: true,
        nome_produto: true,
        versao_codigo: true,
        versao_descricao: true,
        status: true,
        origem: true,
        derivada_de_id: true,
        custo_mp_kg: true,
        validada_em: true,
      },
    });
    return { raiz_id: raizId, total: familia.length, versoes: familia };
  }

  // ----------------------- CUSTO EM TEMPO REAL -----------------------
  async calcularCusto(id: number) {
    const formula = await this.prisma.formula.findUnique({
      where: { id },
      include: {
        composicao: {
          orderBy: { ordem: 'asc' },
          include: { mp: { select: { codigo: true, nome: true, preco_kg_brl: true, data_cotacao: true } } },
        },
      },
    });
    if (!formula) throw new NotFoundException('Formula nao encontrada');

    let totalAtual = 0;
    let somaSnapshot = 0;
    const ingredientes = formula.composicao.map((c) => {
      const conc = c.concentracao_pct !== null ? Number(c.concentracao_pct) : 0;
      const precoAtual = c.mp?.preco_kg_brl != null ? Number(c.mp.preco_kg_brl) : null;
      const custo = precoAtual != null ? (conc / 100) * precoAtual : null;
      if (custo != null) totalAtual += custo;
      if (c.preco_kg_snapshot != null) somaSnapshot += (conc / 100) * Number(c.preco_kg_snapshot);
      const score = c.mp ? scoreCotacao(c.mp.data_cotacao) : 50;
      return {
        mp_id: c.mp_id,
        mp_codigo: c.mp?.codigo ?? null,
        nome: c.mp?.nome ?? c.mp_nome_original,
        sem_match: !c.mp_id,
        fase: c.fase,
        concentracao_pct: conc,
        preco_kg_atual: precoAtual,
        custo_na_formula: custo != null ? Number(custo.toFixed(4)) : null,
        score,
      };
    });

    // score global ponderado pelo peso de custo de cada MP
    const somaPeso = ingredientes.reduce((a, i) => a + (i.custo_na_formula ?? 0), 0);
    let scoreGlobal: number;
    if (somaPeso > 0) {
      scoreGlobal = Math.round(
        ingredientes.reduce((a, i) => a + (i.custo_na_formula ?? 0) * i.score, 0) / somaPeso,
      );
    } else {
      scoreGlobal = ingredientes.length
        ? Math.round(ingredientes.reduce((a, i) => a + i.score, 0) / ingredientes.length)
        : 0;
    }

    const snapshot = formula.custo_mp_kg != null ? Number(formula.custo_mp_kg) : null;
    const delta_pct =
      snapshot && snapshot > 0
        ? Number((((totalAtual - snapshot) / snapshot) * 100).toFixed(2))
        : null;
    const somaConcentracao = Number(
      ingredientes.reduce((a, i) => a + i.concentracao_pct, 0).toFixed(3),
    );

    return {
      custo_mp_kg_atual: Number(totalAtual.toFixed(4)),
      custo_mp_kg_snapshot: snapshot,
      delta_pct,
      score_global: scoreGlobal,
      faixa: faixaScore(scoreGlobal),
      soma_concentracao: somaConcentracao,
      alerta_concentracao: Math.abs(somaConcentracao - 100) > 0.5 ? 'soma != 100%' : null,
      ingredientes,
    };
  }

  // ----------------------- CRIAR -----------------------
  async create(dto: CreateFormulaDto, userId: string) {
    const formula = await this.prisma.formula.create({
      data: {
        nome_produto: dto.nome_produto,
        categoria: dto.categoria,
        cliente_id: dto.cliente_id,
        versao_codigo: '1.0',
        versao_descricao: dto.versao_descricao,
        observacoes: dto.observacoes,
        origem: 'pd_manual',
        status: 'rascunho',
        created_by: userId,
        total_ingredientes: dto.composicao.length,
        composicao: { create: dto.composicao.map((c, i) => this.mapComposicao(c, i)) },
      },
    });
    await this.atualizarCustoSnapshot(formula.id);
    return this.findOne(formula.id);
  }

  // ----------------------- EDITAR (bloqueia validada) -----------------------
  async update(id: number, dto: UpdateFormulaDto) {
    const f = await this.ensure(id);
    if (f.status === 'validada') {
      throw new BadRequestException(
        'Formula validada nao pode ser editada — crie uma nova versao (POST /:id/nova-versao).',
      );
    }
    if (f.status === 'arquivada') {
      throw new BadRequestException('Formula arquivada nao pode ser editada.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.formula.update({
        where: { id },
        data: {
          nome_produto: dto.nome_produto,
          categoria: dto.categoria,
          observacoes: dto.observacoes,
          versao_descricao: dto.versao_descricao,
          ...(dto.composicao
            ? { total_ingredientes: dto.composicao.length }
            : {}),
        },
      });
      if (dto.composicao) {
        await tx.formulaComposicao.deleteMany({ where: { formula_id: id } });
        await tx.formulaComposicao.createMany({
          data: dto.composicao.map((c, i) => ({ formula_id: id, ...this.mapComposicao(c, i) })),
        });
      }
    });
    await this.atualizarCustoSnapshot(id);
    return this.findOne(id);
  }

  // ----------------------- NOVA VERSAO (Lab Vivo) -----------------------
  async novaVersao(id: number, dto: NovaVersaoDto, userId: string) {
    const origem = await this.prisma.formula.findUnique({
      where: { id },
      include: { composicao: { orderBy: { ordem: 'asc' } } },
    });
    if (!origem) throw new NotFoundException('Formula de origem nao encontrada');
    // P0-1: nova versao SO a partir de VALIDADA. Rascunho edita in-place
    // (PATCH /formulas/:id) — senao cada save gerava uma versao-lixo.
    if (origem.status !== 'validada') {
      throw new BadRequestException(
        'Nova versao so a partir de formula VALIDADA. Rascunho e editavel na mesma versao (Continuar edicao).',
      );
    }

    const raizId = origem.formula_mae_id ?? origem.id;
    const familia = await this.prisma.formula.count({
      where: { OR: [{ id: raizId }, { formula_mae_id: raizId }] },
    });
    const novoCodigo = `1.${familia}`; // raiz=1.0; proxima = qtd atual da familia

    // composicao da nova versao: a enviada, ou copia da origem
    const novaComp: ComposicaoItemDto[] = dto.composicao
      ? dto.composicao
      : origem.composicao.map((c) => ({
          fase: c.fase ?? undefined,
          ordem: c.ordem ?? undefined,
          mp_id: c.mp_id ?? undefined,
          mp_nome_original: c.mp_nome_original ?? undefined,
          concentracao_pct: c.concentracao_pct !== null ? Number(c.concentracao_pct) : 0,
          funcao: c.funcao ?? undefined,
          fornecedor_pref: c.fornecedor_pref ?? undefined,
        }));

    const diff = this.calcularDiffComposicao(origem.composicao, novaComp);

    const nova = await this.prisma.formula.create({
      data: {
        nome_produto: origem.nome_produto,
        categoria: origem.categoria,
        cliente_id: origem.cliente_id,
        formula_mae_id: raizId,
        derivada_de_id: origem.id,
        // D6 (Jornada de Laboratório): a nova versao HERDA o NCM da origem — nunca
        // nasce sem NCM. ncm_revisado volta a false (a associacao vale p/ a nova
        // composicao, que pode mudar; humano reconfirma se necessario).
        ncm_id: origem.ncm_id,
        ncm_revisado: false,
        versao_codigo: novoCodigo,
        versao_descricao: dto.versao_descricao,
        origem: 'pd_manual',
        status: 'rascunho',
        created_by: userId,
        total_ingredientes: novaComp.length,
        diff_vs_anterior: diff as Prisma.InputJsonValue,
        composicao: { create: novaComp.map((c, i) => this.mapComposicao(c, i)) },
      },
    });
    await this.atualizarCustoSnapshot(nova.id);
    // completa o diff com custos reais agora que a nova versao existe
    const [custoAnt, custoNovo] = await Promise.all([
      this.calcularCusto(origem.id),
      this.calcularCusto(nova.id),
    ]);
    const deltaPct =
      custoAnt.custo_mp_kg_atual > 0
        ? Number(
            (((custoNovo.custo_mp_kg_atual - custoAnt.custo_mp_kg_atual) /
              custoAnt.custo_mp_kg_atual) *
              100).toFixed(2),
          )
        : null;
    await this.prisma.formula.update({
      where: { id: nova.id },
      data: {
        diff_vs_anterior: {
          ...diff,
          custo_anterior_kg: custoAnt.custo_mp_kg_atual,
          custo_novo_kg: custoNovo.custo_mp_kg_atual,
          delta_pct: deltaPct,
        } as Prisma.InputJsonValue,
      },
    });

    // JORNADA DE LAB (re-link): se a ORIGEM é a fórmula vinculada de uma
    // pendência em atendimento, o vínculo SEGUE a nova versão — o editor cria
    // versão ao salvar, e a "fórmula da pendência" deve ser sempre a corrente.
    // O invariante do concluir permanece: só a vinculada conclui.
    await this.prisma.pendenciaLab.updateMany({
      where: { formula_resultado_id: origem.id, status: 'em_atendimento' },
      data: { formula_resultado_id: nova.id },
    });

    return this.findOne(nova.id);
  }

  // ----------------------- VALIDAR -----------------------
  async validar(id: number, dto: ValidarFormulaDto, userId: string) {
    const f = await this.ensure(id);
    if (f.status === 'validada') {
      throw new BadRequestException('Formula ja esta validada.');
    }
    // P0-1: o rascunho salva parcial, mas a VALIDAÇÃO exige a soma das
    // concentrações na faixa — fórmula 50% não pode virar validada.
    const comp = await this.prisma.formulaComposicao.findMany({
      where: { formula_id: id },
      select: { concentracao_pct: true },
    });
    const soma = somaComposicao(comp.map((c) => (c.concentracao_pct != null ? Number(c.concentracao_pct) : null)));
    if (!somaValidaParaValidacao(soma)) {
      throw new BadRequestException(
        `Soma das concentracoes fora da faixa (${soma.toFixed(2)}% — exigido ${SOMA_MIN}% a ${SOMA_MAX}%). Complete a formula antes de validar.`,
      );
    }
    await this.prisma.formula.update({
      where: { id },
      data: {
        status: 'validada',
        validada_em: new Date(),
        validada_por: userId,
        validacao_obs: dto.validacao_obs,
      },
    });
    return this.findOne(id);
  }

  // ----------------------- ARQUIVAR -----------------------
  async arquivar(id: number) {
    await this.ensure(id);
    await this.prisma.formula.update({ where: { id }, data: { status: 'arquivada' } });
    return { id, status: 'arquivada' };
  }

  // ----------------------- NCM: FILA DE REVISAO (F5 Bloco C) -----------------------
  /**
   * Lista as formulas com NCM derivado pendente de revisao humana (as 274):
   * ncm_revisado=false E ncm_id != null. Payload traz o NCM sugerido.
   */
  async pendentesNcm(query: { q?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const where: Prisma.FormulaWhereInput = { ncm_revisado: false, ncm_id: { not: null } };
    if (query.q) where.nome_produto = { contains: query.q, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.formula.findMany({
        where,
        orderBy: { nome_produto: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          nome_produto: true,
          versao_codigo: true,
          categoria: true,
          status: true,
          ncm_id: true,
          ncm: {
            select: { id: true, ncm: true, descricao: true, ipi_pct: true, monofasico: true, ativo: true },
          },
        },
      }),
      this.prisma.formula.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Confirma (ou troca) o NCM da formula e carimba a revisao humana.
   * Espelha o validar; SEM guard de idempotencia (re-revisar p/ corrigir e permitido).
   */
  async revisarNcm(id: number, dto: RevisarNcmDto, userId: string) {
    const f = await this.ensure(id);
    const novoNcmId = dto.ncm_id ?? f.ncm_id;
    if (novoNcmId == null) {
      throw new BadRequestException('Sem NCM para confirmar. Informe ncm_id para associar.');
    }
    // Troca: valida que o NCM existe E esta ativo (soft-delete do Bloco B = nao usar).
    if (dto.ncm_id != null && dto.ncm_id !== f.ncm_id) {
      const ncm = await this.prisma.ncm.findUnique({
        where: { id: dto.ncm_id },
        select: { id: true, ativo: true },
      });
      if (!ncm) throw new BadRequestException('NCM informado nao existe.');
      if (!ncm.ativo) throw new BadRequestException('NCM informado esta inativo.');
    }
    await this.prisma.formula.update({
      where: { id },
      data: {
        ncm_id: novoNcmId,
        ncm_revisado: true,
        ncm_revisado_em: new Date(),
        ncm_revisado_por: userId,
      },
    });
    return this.findOne(id);
  }

  // ----------------------- BUSCA FUZZY (GIN tsvector) -----------------------
  async buscar(q: string) {
    const termo = (q ?? '').trim();
    if (termo.length < 2) return [];
    // monta tsquery com prefixo: "botox vit" -> "botox:* & vit:*"
    const tsquery = termo
      .replace(new RegExp("[\\u0300-\\u036f]", 'g'), '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, '') + ':*')
      .filter((w) => w.length > 2)
      .join(' & ');
    if (!tsquery) return [];
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, nome_produto, versao_codigo, status, origem, categoria,
              ts_rank(to_tsvector('portuguese', nome_produto), to_tsquery('portuguese', $1)) AS rank
       FROM formulas
       WHERE to_tsvector('portuguese', nome_produto) @@ to_tsquery('portuguese', $1)
       ORDER BY rank DESC, nome_produto ASC
       LIMIT 20`,
      tsquery,
    );
  }

  // ----------------------- SUGERIR SIMILARES -----------------------
  async sugerirSimilar(dto: SugerirSimilarDto) {
    const base = [dto.nome_produto, dto.texto].filter(Boolean).join(' ').trim();
    if (!base && !dto.categoria) {
      throw new BadRequestException('Informe nome_produto, texto ou categoria.');
    }
    const tsquery = base
      .replace(new RegExp("[\\u0300-\\u036f]", 'g'), '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, '') + ':*')
      .filter((w) => w.length > 2)
      .join(' | '); // OR — mais abrangente para sugestao

    // monta WHERE/params de forma explicita (sem indexacao condicional fragil)
    const params: any[] = [];
    const conds: string[] = ['formula_mae_id IS NULL'];
    let rankExpr = '0';
    if (tsquery) {
      params.push(tsquery);
      const p = `$${params.length}`;
      rankExpr = `ts_rank(to_tsvector('portuguese', nome_produto), to_tsquery('portuguese', ${p}))`;
      conds.push(`to_tsvector('portuguese', nome_produto) @@ to_tsquery('portuguese', ${p})`);
    }
    if (dto.categoria) {
      params.push(dto.categoria);
      conds.push(`categoria = $${params.length}`);
    }
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, nome_produto, versao_codigo, categoria, status, custo_mp_kg,
              ${rankExpr} AS rank
       FROM formulas
       WHERE ${conds.join(' AND ')}
       ORDER BY rank DESC, nome_produto ASC
       LIMIT 5`,
      ...params,
    );
    return {
      criterio: { texto: base || null, categoria: dto.categoria ?? null },
      sugestoes: rows,
      nota: 'Ranking textual (tsvector). Reranking por IA sera adicionado no modulo de orcamento.',
    };
  }

  // ----------------------- HELPERS -----------------------
  private async ensure(id: number) {
    const f = await this.prisma.formula.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('Formula nao encontrada');
    return f;
  }

  private mapComposicao(c: ComposicaoItemDto, index: number) {
    return {
      fase: c.fase,
      ordem: c.ordem ?? index,
      mp_id: c.mp_id,
      mp_nome_original: c.mp_nome_original,
      concentracao_pct: c.concentracao_pct,
      funcao: c.funcao,
      fornecedor_pref: c.fornecedor_pref,
    };
  }

  /** Recalcula custo com precos atuais e grava em formulas.custo_mp_kg. */
  private async atualizarCustoSnapshot(id: number) {
    const custo = await this.calcularCusto(id);
    await this.prisma.formula.update({
      where: { id },
      data: { custo_mp_kg: custo.custo_mp_kg_atual },
    });
  }

  /** Diff de composicao (por mp_id ou nome) — base do diff_vs_anterior. */
  private calcularDiffComposicao(
    anterior: { mp_id: number | null; mp_nome_original: string | null; concentracao_pct: Prisma.Decimal | null }[],
    nova: ComposicaoItemDto[],
  ) {
    const chave = (mpId?: number | null, nome?: string | null) =>
      mpId != null ? `id:${mpId}` : `nome:${(nome ?? '').toLowerCase().trim()}`;
    const mapaAnt = new Map(anterior.map((c) => [chave(c.mp_id, c.mp_nome_original), Number(c.concentracao_pct ?? 0)]));
    const mapaNovo = new Map(nova.map((c) => [chave(c.mp_id, c.mp_nome_original), c.concentracao_pct]));

    const alteracoes: any[] = [];
    for (const [k, concNova] of mapaNovo) {
      const nome = k.startsWith('id:') ? k : k.slice(5);
      if (!mapaAnt.has(k)) {
        alteracoes.push({ mp: nome, para: concNova, tipo: 'adicionada' });
      } else if (mapaAnt.get(k) !== concNova) {
        alteracoes.push({ mp: nome, de: mapaAnt.get(k), para: concNova, tipo: 'concentracao' });
      }
    }
    for (const [k, concAnt] of mapaAnt) {
      if (!mapaNovo.has(k)) {
        const nome = k.startsWith('id:') ? k : k.slice(5);
        alteracoes.push({ mp: nome, de: concAnt, tipo: 'removida' });
      }
    }
    return { alteracoes };
  }
}
