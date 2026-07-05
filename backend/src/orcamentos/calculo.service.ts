import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  calcularCustoPrivate,
  InputsCusto,
  ParametrosCusto,
} from './custo-engine';
import { scoreCotacao, faixaScore } from '../formulas/score.util';
import { lerParametrosCusto } from './params.util';
import { calcularMoMatriz } from './mo-matriz.util';
import { CalcularDto } from './dto/calcular.dto';
import { resolverNcmEfetivo } from './ncm-efetivo.util';
import { lerParametrosFiscaisVigentes } from './params-fiscais.util';
import { calcularCustoFiscal } from './custo-engine-fiscal';
import type { ModoOperacao, NcmFiscal, PerfilClienteFiscal } from './matriz-fiscal.util';
import { resolverTributosSaida } from './matriz-fiscal.util';

type FormulaComCusto = {
  id: number;
  nome_produto: string;
  versao_codigo: string | null;
  status: string;
  origem: string;
  custo_mp_kg_atual: number;
  score_global: number;
  ingredientes: any[];
  composicao_snapshot: any[];
} | null;

type EmbalagemResolvida = {
  embalagem_un: number;
  preliminar: boolean; // true = embalagem escolhida porem sem cotacao (custo R$0)
  snapshot: any | null;
};

@Injectable()
export class CalculoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fase 1 (Doc 2d) — DETERMINISTICA, sem IA. Monta os inputs a partir do
   * orcamento/formula/catalogo, roda o motor e devolve o JSON_CALC travado.
   * Zero chamada de API: produtividade (un_min) e embalagem sao inputs diretos.
   */
  async gerarCalculo(orcamentoId: string, overrides: CalcularDto) {
    const orc = await this.prisma.orcamento.findUnique({ where: { id: orcamentoId } });
    if (!orc) throw new NotFoundException('Orcamento nao encontrado');

    const cfg = await this.getParametros();
    const formula = orc.formula_id ? await this.carregarFormula(orc.formula_id) : null;

    const volume_un = orc.volume_un != null ? Number(orc.volume_un) : 100;
    const quantidade = orc.quantidade ?? 1000;
    const margem_pct = overrides.margem_pct ?? (orc.margem_pct != null ? Number(orc.margem_pct) : 30);

    // Produtividade direta (Doc 2d §A) — obrigatoria: do calculo OU ja no orcamento.
    const un_min = overrides.un_min ?? (orc.un_min != null ? Number(orc.un_min) : undefined);
    if (un_min == null) {
      throw new BadRequestException(
        'un_min (produtividade em unidades/minuto) e obrigatorio. Informe no calculo ou grave no orcamento.',
      );
    }

    // Embalagem via catalogo (Doc 2d §B): snapshot do orcamento, catalogo, ou sem embalagem.
    const emb = await this.resolverEmbalagem(orc);

    // Custo de MP base por kg: formula > override manual > budget do briefing > 0.
    // Fragrancia agora e MP da composicao (decisao A) — sem input separado.
    const cmp_base_mp_kg =
      formula?.custo_mp_kg_atual ??
      overrides.cmp_base_mp_kg ??
      (orc.budget_mp != null ? Number(orc.budget_mp) : 0);

    const inputs: InputsCusto = {
      cmp_base_mp_kg,
      volume_un,
      quantidade,
      un_min,
      margem_pct,
      mp_frag_kg: 0,
      embalagem_un: emb.embalagem_un,
    };

    const calc = calcularCustoPrivate(inputs, cfg);
    const score_global = formula ? formula.score_global : 55; // sem formula => baixa confianca

    // Blindagem: sem base de MP (R$0/kg) o preco vira so MO — sinaliza preliminar.
    const semBaseMp = cmp_base_mp_kg === 0;
    const preliminar = emb.preliminar || semBaseMp;
    const aviso = semBaseMp
      ? 'Calculo sem base de materia-prima (R$0/kg). Defina uma formula ou informe o budget de MP para um valor real.'
      : emb.preliminar
        ? 'Embalagem sem cotacao — custo usa R$0 e o orcamento e preliminar (Doc 2d §B4).'
        : undefined;

    const calculo = {
      _mode: 'deterministico',
      _modelo_versao: '2.0',
      _gerado_em: new Date().toISOString(),
      _preliminar: preliminar || undefined,
      _aviso: aviso,
      inputs,
      parametros: cfg,
      custo_mp: calc.custo_mp,
      mao_de_obra: calc.mao_de_obra,
      resultado: calc.resultado,
      score_global,
      faixa: faixaScore(score_global),
      formula_usada: formula
        ? {
            id: formula.id,
            nome: formula.nome_produto,
            versao: formula.versao_codigo,
            status: formula.status,
            origem: formula.origem,
          }
        : null,
      embalagem: emb.snapshot,
      ingredientes: formula?.ingredientes ?? [],
    };

    return {
      calculo,
      preco_sipi: calc.resultado.preco_sipi,
      preco_cipi: calc.resultado.preco_cipi,
      score_global,
      formula_versao_codigo: formula?.versao_codigo ?? null,
      formula_status_momento: formula?.status ?? null,
      formula_composicao_snapshot: formula?.composicao_snapshot ?? null,
    };
  }

  /**
   * F4 passo 2 — COMPARADOR read-only dos dois modelos de MO.
   * Roda o engine VIGENTE (intocado) e recompõe um preço alternativo trocando
   * SÓ o cmo_cimp pelo do modelo Matriz, reusando o MESMO cmp_cimp/margem/IPI.
   * NÃO grava nada, NÃO altera o fluxo de calcular.
   */
  async compararMo(orcamentoId: string) {
    const r2 = (n: number) => Number(n.toFixed(2));

    // 1) caminho VIGENTE, intocado — fonte da verdade do preço atual
    const atual = await this.gerarCalculo(orcamentoId, {});
    const calc = atual.calculo;
    const cmp_cimp = calc.custo_mp.cmp_cimp; // r4, reusado igual
    const cmo_cimp_atual = calc.mao_de_obra.cmo_cimp; // r4
    const margem = calc.resultado.margem_pct;
    const ipi_pct = calc.parametros.ipi_pct;
    const imposto_mo_pct = calc.parametros.imposto_mo_pct;
    const un_min = calc.inputs.un_min;

    // 2) campos da Matriz (mesma system_config) — leitura read-only
    const c = await this.prisma.systemConfig.findUnique({ where: { id: 1 } });
    const moMatriz = calcularMoMatriz(
      {
        custo_fixo_mensal: c ? Number(c.custo_fixo_mensal) : 120240,
        mo_dias_uteis: c ? c.mo_dias_uteis : 22,
        horas_dia: c ? Number(c.horas_dia) : 8,
        imposto_mo_pct,
      },
      un_min,
    );

    // 3) recompõe SÓ trocando o cmo_cimp; mesma disciplina de arredondamento do engine
    const custo_total_matriz = cmp_cimp + moMatriz.cmo_cimp;
    const preco_sipi_matriz_full = custo_total_matriz / (1 - margem / 100);
    const preco_cipi_matriz_full = preco_sipi_matriz_full * (1 + ipi_pct / 100);
    const preco_sipi_matriz = r2(preco_sipi_matriz_full);
    const preco_cipi_matriz = r2(preco_cipi_matriz_full);

    const preco_sipi_atual = calc.resultado.preco_sipi; // engine nativo
    const preco_cipi_atual = calc.resultado.preco_cipi;
    const delta_abs = r2(preco_cipi_matriz - preco_cipi_atual);
    const delta_pct =
      preco_cipi_atual > 0 ? r2((delta_abs / preco_cipi_atual) * 100) : null;

    return {
      orcamento_id: orcamentoId,
      un_min,
      dias_necessarios: calc.mao_de_obra.dias_necessarios,
      quantidade: calc.inputs.quantidade,
      preco_sipi_atual,
      preco_sipi_matriz,
      preco_cipi_atual,
      preco_cipi_matriz,
      delta_abs,
      delta_pct,
      mo_atual: { cmo_cimp: cmo_cimp_atual }, // modelo vigente (folha/dias×ceil)
      mo_matriz: {
        // modelo Matriz (custo_fixo/min bruto)
        custo_minuto_bruto: moMatriz.custo_minuto_bruto,
        mo_un: moMatriz.mo_un,
        cmo_cimp: moMatriz.cmo_cimp,
      },
    };
  }

  /**
   * F4 FASE A — COMPARADOR read-only vigente × engine fiscal v3.
   * Mesmo padrão do compararMo: o caminho VIGENTE (gerarCalculo) fica INTOCADO;
   * o v3 roda ao lado com (modo_operacao × perfil do cliente × NCM efetivo ×
   * parâmetros fiscais vigentes). NÃO grava nada.
   */
  async compararFiscal(orcamentoId: string) {
    const r2 = (n: number) => Number(n.toFixed(2));

    // 1) caminho VIGENTE, intocado
    const atual = await this.gerarCalculo(orcamentoId, {});
    const calc = atual.calculo;

    // 2) contexto fiscal: orçamento + cliente + NCM efetivo
    const orc = await this.prisma.orcamento.findUnique({
      where: { id: orcamentoId },
      include: { cliente: true },
    });
    if (!orc) throw new NotFoundException('Orcamento nao encontrado');

    const formula = orc.formula_id
      ? await this.prisma.formula.findUnique({
          where: { id: orc.formula_id },
          select: { ncm_id: true },
        })
      : null;
    const ncmId = resolverNcmEfetivo(orc.ncm_id, formula?.ncm_id ?? null);
    const ncmRow = ncmId ? await this.prisma.ncm.findUnique({ where: { id: ncmId } }) : null;

    // FALHA VISÍVEL: sem NCM não existe IPI conhecido — não estimamos (regra 6).
    if (!ncmRow) {
      return {
        orcamento_id: orcamentoId,
        comparavel: false,
        motivo: 'sem_ncm',
        mensagem:
          'Orçamento sem NCM efetivo (nem override, nem NCM na fórmula) — o engine fiscal exige NCM para o IPI. Atribua um NCM para comparar.',
        preco_sipi_atual: calc.resultado.preco_sipi,
        preco_cipi_atual: calc.resultado.preco_cipi,
      };
    }

    // 3) matriz fiscal (parâmetros versionados + flag de caracterização)
    const { params, caracterizacao } = await lerParametrosFiscaisVigentes(this.prisma);
    const modo = (orc.modo_operacao ?? 'full_service') as ModoOperacao;
    const perfil: PerfilClienteFiscal = {
      regime_fiscal: (orc.cliente?.regime_fiscal ?? null) as PerfilClienteFiscal['regime_fiscal'],
      finalidade: (orc.cliente?.finalidade_padrao ?? null) as PerfilClienteFiscal['finalidade'],
      uf: orc.cliente?.uf ?? null,
      contribuinte_icms: orc.cliente?.contribuinte_icms ?? null,
    };
    const ncmFiscal: NcmFiscal = {
      ncm: ncmRow.ncm,
      ex_tipi: ncmRow.ex_tipi,
      ipi_pct: Number(ncmRow.ipi_pct),
      monofasico: ncmRow.monofasico,
      tratamento: ncmRow.tratamento as NcmFiscal['tratamento'],
      icms_nominal_pct: ncmRow.icms_nominal_pct != null ? Number(ncmRow.icms_nominal_pct) : null,
    };
    const tributos = resolverTributosSaida(modo, perfil, ncmFiscal, params, caracterizacao);

    // 4) engine v3 sobre os MESMOS inputs do cálculo vigente
    const novo = calcularCustoFiscal(
      {
        cmp_base_mp_kg: calc.inputs.cmp_base_mp_kg,
        volume_un: calc.inputs.volume_un,
        quantidade: calc.inputs.quantidade,
        un_min: calc.inputs.un_min,
        margem_pct: calc.inputs.margem_pct,
        embalagem_un: calc.inputs.embalagem_un,
      },
      {
        mo_folha_mensal: calc.parametros.mo_folha_mensal,
        mo_dias_uteis: calc.parametros.mo_dias_uteis,
        desvio_mp_pct: calc.parametros.desvio_mp_pct,
        frete_un_brl: calc.parametros.frete_un_brl,
      },
      tributos,
    );

    // 5) decomposição da causa (D6 — o diff explica, não só aponta)
    const colchao_mp_un = r2(calc.custo_mp.cmp_cimp - calc.custo_mp.cmp_simp);
    const flat_mo_un = r2(calc.mao_de_obra.cmo_cimp - calc.mao_de_obra.mo_un);
    const delta_cipi = r2(novo.resultado.preco_cipi - calc.resultado.preco_cipi);

    return {
      orcamento_id: orcamentoId,
      comparavel: true,
      modo_operacao: modo,
      ncm: `${ncmRow.ncm}${ncmRow.ex_tipi ? ' ' + ncmRow.ex_tipi : ''}`,
      caracterizacao_ligada: caracterizacao.industrializacao_caracterizada,
      preco_sipi_atual: calc.resultado.preco_sipi,
      preco_cipi_atual: calc.resultado.preco_cipi,
      preco_sipi_novo: novo.resultado.preco_sipi,
      preco_cipi_novo: novo.resultado.preco_cipi,
      delta_cipi_abs: delta_cipi,
      delta_cipi_pct:
        calc.resultado.preco_cipi > 0 ? r2((delta_cipi / calc.resultado.preco_cipi) * 100) : null,
      decomposicao: {
        colchao_mp_removido_un: colchao_mp_un, // 37,5% flat que saiu do custo
        flat_mo_removido_un: flat_mo_un, // 9,25% flat que saiu do custo de MO
        ipi_flat_atual: { pct: calc.parametros.ipi_pct, un: calc.resultado.ipi_un },
        ipi_real_novo: { pct: novo.resultado.ipi_pct, base: novo.resultado.base_ipi, un: novo.resultado.ipi_un },
        icms_sobre_ipi_un: novo.resultado.icms_sobre_ipi,
        tributos_por_dentro: novo.parcelas,
      },
      fundamentos: novo.fundamentos,
      calculo_novo: novo,
    };
  }

  // ---------------- parametros de custo (system_config) ----------------
  private async getParametros(): Promise<ParametrosCusto> {
    const c = await this.prisma.systemConfig.findUnique({ where: { id: 1 } });
    return lerParametrosCusto(c);
  }

  // ---------------- embalagem do catalogo (Doc 2d §B4) ----------------
  private async resolverEmbalagem(orc: any): Promise<EmbalagemResolvida> {
    if (orc.sem_embalagem) return { embalagem_un: 0, preliminar: false, snapshot: null };

    // Snapshot ja gravado tem prioridade (preco travado no momento do orcamento).
    let snap = orc.embalagem_snapshot as any | null;
    if (!snap && orc.embalagem_id) {
      const e = await this.prisma.embalagem.findUnique({ where: { id: orc.embalagem_id } });
      if (e) {
        snap = {
          id: e.id,
          nome: e.nome,
          tipo: e.tipo,
          preco_un_brl: e.preco_un_brl != null ? Number(e.preco_un_brl) : null,
          fornecedor: e.fornecedor,
          preco_estimado: e.preco_estimado,
        };
      }
    }
    if (!snap) return { embalagem_un: 0, preliminar: false, snapshot: null };

    const preco = snap.preco_un_brl != null ? Number(snap.preco_un_brl) : null;
    // Sem cotacao -> usa R$0 e marca o orcamento como preliminar.
    return { embalagem_un: preco ?? 0, preliminar: preco == null, snapshot: snap };
  }

  // ---------------- carrega formula + custo atual + score ----------------
  private async carregarFormula(formulaId: number): Promise<FormulaComCusto> {
    const f = await this.prisma.formula.findUnique({
      where: { id: formulaId },
      include: {
        composicao: {
          orderBy: { ordem: 'asc' },
          include: { mp: { select: { codigo: true, nome: true, preco_kg_brl: true, data_cotacao: true } } },
        },
      },
    });
    if (!f) return null;

    let custoAtual = 0;
    const ingredientes = f.composicao.map((c) => {
      const conc = c.concentracao_pct != null ? Number(c.concentracao_pct) : 0;
      const preco = c.mp?.preco_kg_brl != null ? Number(c.mp.preco_kg_brl) : null;
      const custo = preco != null ? (conc / 100) * preco : null;
      if (custo != null) custoAtual += custo;
      return {
        nome: c.mp?.nome ?? c.mp_nome_original,
        mp_codigo: c.mp?.codigo ?? null,
        concentracao_pct: conc,
        preco_kg_atual: preco,
        custo_na_formula: custo != null ? Number(custo.toFixed(4)) : null,
        score: c.mp ? scoreCotacao(c.mp.data_cotacao) : 50,
        fase: c.fase,
      };
    });

    const somaPeso = ingredientes.reduce((a, i) => a + (i.custo_na_formula ?? 0), 0);
    const score =
      somaPeso > 0
        ? Math.round(ingredientes.reduce((a, i) => a + (i.custo_na_formula ?? 0) * i.score, 0) / somaPeso)
        : ingredientes.length
          ? Math.round(ingredientes.reduce((a, i) => a + i.score, 0) / ingredientes.length)
          : 50;

    return {
      id: f.id,
      nome_produto: f.nome_produto,
      versao_codigo: f.versao_codigo,
      status: f.status,
      origem: f.origem,
      custo_mp_kg_atual: Number(custoAtual.toFixed(4)),
      score_global: score,
      ingredientes,
      composicao_snapshot: ingredientes,
    };
  }
}
