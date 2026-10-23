import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { lerParametrosCusto } from '../orcamentos/params.util';
import { lerParametrosProducaoVigentes } from '../orcamentos/params-producao.util';
import { lerParametrosFiscaisVigentes } from '../orcamentos/params-fiscais.util';
import {
  lerParametrosMotor2,
  type VigenciaUsada,
} from '../orcamentos/params-motor2.util';
import { calcularCustoProducao } from '../orcamentos/custo-producao.util';
import { hojeSaoPaulo } from '../orcamentos/hoje.util';
import {
  avaliarViabilidade,
  resumoViabilidade,
  sanitizarLatin1,
  type ContextoViabilidade,
  type PremissasCenario,
  type PremissasViabilidade,
  type ResultadoViabilidade,
} from './viabilidade-engine';
import { CreateProjetoViabilidadeDto } from './dto/create-projeto-viabilidade.dto';
import { UpdateProjetoViabilidadeDto } from './dto/update-projeto-viabilidade.dto';
import type { PremissasViabilidadeDto } from './dto/premissas-viabilidade.dto';

/**
 * Chaves OPCIONAIS de parametro_producao lidas só por este módulo. Quando
 * vigentes, viram default das premissas (com a origem informada); sem
 * vigência ficam null e o engine ALERTA (nunca número inventado).
 * Precisam constar em CHAVES_PARAMETRO_PRODUCAO (create-parametro-producao.dto)
 * para serem cadastráveis pela Matriz de Custo.
 */
export const CHAVE_CUSTO_HORA_EXTRA = 'custo_hora_extra_hora';
export const CHAVE_PESSOAS_POR_LINHA = 'pessoas_por_linha';

/** Default de premissa + de onde veio (parâmetro vigente / política / não informado). */
export interface DefaultPremissa {
  campo: keyof PremissasCenario;
  valor: number | string | null;
  origem: string;
}

export interface ContextoViabilidadeResposta {
  /** null quando falta vigência — `erro` explica (texto, nunca número falso). */
  parametros: {
    producao: ContextoViabilidade['producao'];
    derivados: {
      capacidade_normal_min_mes: number;
      taxa_minuto: number;
      custo_setup_ordem: number;
      minutos_produtivos_dia_linha: number;
    };
    fiscal: ContextoViabilidade['fiscal'];
    caracterizacao: ContextoViabilidade['caracterizacao'];
    escada: ContextoViabilidade['escada'];
    lote_minimo_un: number;
    un_min_padrao: number | null;
    vigencias: VigenciaUsada[];
  } | null;
  erro: string | null;
  defaults: DefaultPremissa[];
  ncms: Array<{
    id: number;
    ncm: string;
    ex_tipi: string;
    descricao: string;
    ipi_pct: number;
    monofasico: boolean;
    tratamento: string;
    icms_nominal_pct: number | null;
    provisorio: boolean;
  }>;
  clientes: Array<{
    id: string;
    nome: string;
    regime_fiscal: string | null;
    finalidade_padrao: string | null;
    uf: string | null;
    contribuinte_icms: boolean | null;
  }>;
}

interface ContextoCarregado {
  ctx: ContextoViabilidade;
  defaults: DefaultPremissa[];
  un_min_padrao: number | null;
}

const toNum = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number((v as { toString(): string }).toString());

const SELECAO_LISTA = {
  id: true,
  nome: true,
  status: true,
  cliente_id: true,
  calculado_em: true,
  created_at: true,
  updated_at: true,
  resultado: true,
  cliente: { select: { id: true, nome: true } },
} as const;

@Injectable()
export class ViabilidadeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ======================= contexto (parâmetros vigentes) =======================

  /**
   * Lê TUDO que o engine precisa a partir das vigências (mesmas funções do
   * calculo.service): fábrica, política do Motor 2, legado perda/frete da
   * system_config, matriz fiscal. Falha visível se faltar vigência.
   */
  private async carregarContexto(): Promise<ContextoCarregado> {
    // UM unico "hoje" (data civil de Sao Paulo) para todas as vigencias lidas.
    const hoje = hojeSaoPaulo();
    const producao = await lerParametrosProducaoVigentes(this.prisma, hoje);
    const cfg = lerParametrosCusto(
      await this.prisma.systemConfig.findUnique({ where: { id: 1 } }),
    );
    const m2 = await lerParametrosMotor2(
      this.prisma,
      producao,
      { perda_mp_pct: cfg.desvio_mp_pct, frete_un_brl: cfg.frete_un_brl },
      hoje,
    );
    const { params: fiscal, caracterizacao } = await lerParametrosFiscaisVigentes(this.prisma, hoje);
    const extras = await this.lerChavesOpcionaisProducao(hoje);

    const ctx: ContextoViabilidade = {
      producao,
      fiscal,
      caracterizacao,
      escada: m2.params.escada,
      lote_minimo_un: m2.params.lote_minimo_un,
      vigencias: [...m2.vigencias, ...extras.vigencias],
    };

    const vig = (chave: string) => m2.vigencias.find((v) => v.chave === chave);
    const origemVig = (tabela: string, chave: string) => {
      const v = vig(chave);
      return v ? `${tabela}.${chave} (vigencia ${v.vigencia_inicio})` : `${tabela}.${chave}`;
    };
    const defaults: DefaultPremissa[] = [
      { campo: 'perda_mp_pct', valor: m2.params.perda_mp_pct, origem: 'system_config.desvio_mp_pct (Matriz de Custo > Operacional)' },
      { campo: 'frete_un_brl', valor: m2.params.frete_un_brl, origem: 'system_config.frete_un_brl (Matriz de Custo > Operacional)' },
      { campo: 'credito_mp_pct', valor: m2.params.credito_mp_pct, origem: origemVig('parametro_fiscal', 'credito_mp_pct') },
      { campo: 'credito_emb_pct', valor: m2.params.credito_emb_pct, origem: origemVig('parametro_fiscal', 'credito_emb_pct') },
      {
        campo: 'taxa_gestao_embalagem_pct',
        valor: m2.params.taxa_gestao_embalagem_pct,
        origem: origemVig('parametro_producao', 'taxa_gestao_embalagem_pct'),
      },
      {
        campo: 'un_min',
        valor: m2.un_min_padrao,
        origem: m2.un_min_padrao != null ? origemVig('parametro_producao', 'un_min_padrao') : 'nao informado (sem un_min_padrao vigente)',
      },
      {
        campo: 'custo_hora_extra_hora',
        valor: extras.custo_hora_extra_hora,
        origem:
          extras.custo_hora_extra_hora != null
            ? `parametro_producao.${CHAVE_CUSTO_HORA_EXTRA} (vigencia ${extras.vigencias.find((v) => v.chave === CHAVE_CUSTO_HORA_EXTRA)?.vigencia_inicio})`
            : `nao informado (sem parametro_producao.${CHAVE_CUSTO_HORA_EXTRA} vigente) - o engine alerta`,
      },
      {
        campo: 'pessoas_por_linha',
        valor: extras.pessoas_por_linha,
        origem:
          extras.pessoas_por_linha != null
            ? `parametro_producao.${CHAVE_PESSOAS_POR_LINHA} (vigencia ${extras.vigencias.find((v) => v.chave === CHAVE_PESSOAS_POR_LINHA)?.vigencia_inicio})`
            : `nao informado (sem parametro_producao.${CHAVE_PESSOAS_POR_LINHA} vigente) - obrigatorio informar`,
      },
      { campo: 'margem_pct', valor: null, origem: 'escada de margem do Motor 2 (automatica por lote)' },
      { campo: 'preco_venda_un', valor: null, origem: 'calculado pelo Motor 2 (informe para impor o preco)' },
      { campo: 'modo_operacao', valor: 'full_service', origem: 'politica (modo mais comum)' },
    ];

    return { ctx, defaults, un_min_padrao: m2.un_min_padrao };
  }

  /** chaves opcionais (HE e pessoas por linha) vigentes em parametro_producao. */
  private async lerChavesOpcionaisProducao(hoje: Date) {
    const rows = await this.prisma.parametroProducao.findMany({
      where: {
        chave: { in: [CHAVE_CUSTO_HORA_EXTRA, CHAVE_PESSOAS_POR_LINHA] },
        vigencia_inicio: { lte: hoje },
        OR: [{ vigencia_fim: null }, { vigencia_fim: { gte: hoje } }],
      },
      orderBy: { vigencia_inicio: 'desc' },
    });
    const vig = new Map<string, VigenciaUsada>();
    for (const r of rows) {
      if (!vig.has(r.chave)) {
        vig.set(r.chave, {
          chave: r.chave,
          valor: Number(r.valor),
          vigencia_inicio: r.vigencia_inicio.toISOString().slice(0, 10),
          fonte: r.fonte,
        });
      }
    }
    return {
      custo_hora_extra_hora: vig.get(CHAVE_CUSTO_HORA_EXTRA)?.valor ?? null,
      pessoas_por_linha: vig.get(CHAVE_PESSOAS_POR_LINHA)?.valor ?? null,
      vigencias: Array.from(vig.values()),
    };
  }

  /** GET /viabilidade/contexto — tudo para preencher o formulário. */
  async contexto(): Promise<ContextoViabilidadeResposta> {
    let parametros: ContextoViabilidadeResposta['parametros'] = null;
    let erro: string | null = null;
    let defaults: DefaultPremissa[] = [];
    try {
      const c = await this.carregarContexto();
      const d = calcularCustoProducao(c.ctx.producao, 1, 1); // derivados independem de un_min/quantidade
      parametros = {
        producao: c.ctx.producao,
        derivados: {
          capacidade_normal_min_mes: d.capacidade_normal_min_mes,
          taxa_minuto: d.taxa_minuto,
          custo_setup_ordem: d.custo_setup_ordem,
          minutos_produtivos_dia_linha: d.minutos_produtivos_dia_linha,
        },
        fiscal: c.ctx.fiscal,
        caracterizacao: c.ctx.caracterizacao,
        escada: c.ctx.escada,
        lote_minimo_un: c.ctx.lote_minimo_un,
        un_min_padrao: c.un_min_padrao,
        vigencias: c.ctx.vigencias,
      };
      defaults = c.defaults;
    } catch (e) {
      erro = (e as Error).message;
    }

    const [ncms, clientes] = await Promise.all([
      this.prisma.ncm.findMany({ where: { ativo: true }, orderBy: { ncm: 'asc' } }),
      this.prisma.cliente.findMany({
        orderBy: { nome: 'asc' },
        select: {
          id: true,
          nome: true,
          regime_fiscal: true,
          finalidade_padrao: true,
          uf: true,
          contribuinte_icms: true,
        },
      }),
    ]);

    return {
      parametros,
      erro,
      defaults,
      ncms: ncms.map((n) => ({
        id: n.id,
        ncm: n.ncm,
        ex_tipi: n.ex_tipi,
        descricao: n.descricao,
        ipi_pct: toNum(n.ipi_pct) ?? 0,
        monofasico: n.monofasico,
        tratamento: n.tratamento,
        icms_nominal_pct: toNum(n.icms_nominal_pct),
        provisorio: n.provisorio,
      })),
      clientes,
    };
  }

  // ============================== cálculo ==============================

  /** Roda o engine com o contexto vigente. Erros de premissa/vigência -> 400 com a lista. */
  async calcular(premissas: PremissasViabilidadeDto): Promise<ResultadoViabilidade> {
    let ctx: ContextoViabilidade;
    try {
      ctx = (await this.carregarContexto()).ctx;
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    try {
      return avaliarViabilidade(premissas as unknown as PremissasViabilidade, ctx);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ================================ CRUD ================================

  async listar() {
    const rows = await this.prisma.projetoViabilidade.findMany({
      orderBy: { updated_at: 'desc' },
      select: SELECAO_LISTA,
    });
    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      status: r.status,
      cliente_id: r.cliente_id,
      cliente_nome: r.cliente?.nome ?? null,
      calculado_em: r.calculado_em,
      created_at: r.created_at,
      updated_at: r.updated_at,
      resumo: resumoViabilidade(r.resultado),
    }));
  }

  async obter(id: number) {
    const p = await this.prisma.projetoViabilidade.findUnique({
      where: { id },
      include: { cliente: { select: { id: true, nome: true } } },
    });
    if (!p) throw new NotFoundException('Projeto de viabilidade nao encontrado');
    return { ...p, resumo: resumoViabilidade(p.resultado) };
  }

  /** POST /viabilidade — cria e já calcula (o projeto nasce com resultado). */
  async criar(dto: CreateProjetoViabilidadeDto, userId: string) {
    await this.validarCliente(dto.cliente_id);
    const resultado = await this.calcular(dto.premissas);
    const premissas = sanitizarLatin1(dto.premissas);
    const novo = await this.prisma.projetoViabilidade.create({
      data: {
        nome: dto.nome.trim(),
        cliente_id: dto.cliente_id ?? null,
        observacoes: dto.observacoes ?? null,
        status: dto.status ?? 'rascunho',
        premissas: premissas as unknown as Prisma.InputJsonValue,
        resultado: resultado as unknown as Prisma.InputJsonValue,
        calculado_em: new Date(),
        created_by: userId,
      },
      include: { cliente: { select: { id: true, nome: true } } },
    });
    const resumo = resumoViabilidade(resultado);
    await this.audit.registrar({
      userId,
      acao: 'criar_projeto_viabilidade',
      entidade: 'projeto_viabilidade',
      entidadeId: novo.id,
      detalhes: { id: novo.id, nome: novo.nome, resumo } as unknown as Prisma.InputJsonValue,
    });
    return { ...novo, resumo };
  }

  /** PATCH /viabilidade/:id — atualiza e RECALCULA (premissas novas ou vigência nova). */
  async atualizar(id: number, dto: UpdateProjetoViabilidadeDto, userId: string) {
    const atual = await this.prisma.projetoViabilidade.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Projeto de viabilidade nao encontrado');
    if (dto.cliente_id !== undefined) await this.validarCliente(dto.cliente_id);

    const premissasDto = (dto.premissas ??
      (atual.premissas as unknown as PremissasViabilidadeDto)) as PremissasViabilidadeDto;
    const resultado = await this.calcular(premissasDto);
    const premissas = sanitizarLatin1(premissasDto);

    const data: Prisma.ProjetoViabilidadeUpdateInput = {
      premissas: premissas as unknown as Prisma.InputJsonValue,
      resultado: resultado as unknown as Prisma.InputJsonValue,
      calculado_em: new Date(),
    };
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.observacoes !== undefined) data.observacoes = dto.observacoes;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.cliente_id !== undefined) {
      data.cliente = dto.cliente_id ? { connect: { id: dto.cliente_id } } : { disconnect: true };
    }

    const u = await this.prisma.projetoViabilidade.update({
      where: { id },
      data,
      include: { cliente: { select: { id: true, nome: true } } },
    });
    const resumo = resumoViabilidade(resultado);
    await this.audit.registrar({
      userId,
      acao: 'alterar_projeto_viabilidade',
      entidade: 'projeto_viabilidade',
      entidadeId: id,
      detalhes: {
        id,
        nome: u.nome,
        status: u.status,
        campos: Object.keys(dto),
        resumo,
      } as unknown as Prisma.InputJsonValue,
    });
    return { ...u, resumo };
  }

  /** POST /viabilidade/:id/calcular — recalcula com as premissas gravadas e a vigência de hoje. */
  async recalcular(id: number, userId: string) {
    const atual = await this.prisma.projetoViabilidade.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Projeto de viabilidade nao encontrado');
    const resultado = await this.calcular(atual.premissas as unknown as PremissasViabilidadeDto);
    const u = await this.prisma.projetoViabilidade.update({
      where: { id },
      data: {
        resultado: resultado as unknown as Prisma.InputJsonValue,
        calculado_em: new Date(),
      },
      include: { cliente: { select: { id: true, nome: true } } },
    });
    const resumo = resumoViabilidade(resultado);
    await this.audit.registrar({
      userId,
      acao: 'calcular_projeto_viabilidade',
      entidade: 'projeto_viabilidade',
      entidadeId: id,
      detalhes: { id, nome: u.nome, resumo } as unknown as Prisma.InputJsonValue,
    });
    return { ...u, resumo };
  }

  /** DELETE /viabilidade/:id — só admin (controller). Exclusão física: é análise, não documento fiscal. */
  async remover(id: number, userId: string) {
    const atual = await this.prisma.projetoViabilidade.findUnique({
      where: { id },
      select: { id: true, nome: true },
    });
    if (!atual) throw new NotFoundException('Projeto de viabilidade nao encontrado');
    await this.prisma.projetoViabilidade.delete({ where: { id } });
    await this.audit.registrar({
      userId,
      acao: 'excluir_projeto_viabilidade',
      entidade: 'projeto_viabilidade',
      entidadeId: id,
      detalhes: { id, nome: atual.nome },
    });
    return { ok: true };
  }

  private async validarCliente(clienteId: string | null | undefined) {
    if (!clienteId) return;
    const c = await this.prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!c) throw new BadRequestException('cliente_id nao corresponde a um cliente cadastrado');
  }
}
